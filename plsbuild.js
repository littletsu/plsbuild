const JAVAPATH = "C:\\Program Files\\Eclipse Adoptium\\jdk-21.0.2.13-hotspot\\bin\\";
const JAVAC = "javac.exe";
const JAVA = "java.exe";
const OUTPATH = "./out";

const NEWLINE = "\r\n";
const NEWLINEDELIM = NEWLINE[NEWLINE.length-1];
const COMMENT = "//";

const { spawn } = require('child_process');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

class Reader {
    constructor(lines) {
        this.lines = lines;
        this.i = 0;
    }
    peek() {
        return this.lines[this.i] ?? null;
    }
    next() {
        return this.lines[++this.i] ?? null;
    }
}

const Test = (type, data) => ({type, data});
const CONFIG = 2;
const Config = (data) => ({type: CONFIG, data});

const IN = 0;
const OUT = 1;

class CommentTestReader {
    constructor(reader, comment=COMMENT) {
        this.reader = reader;
        this.comment = comment;
        this.testI = -1;
        this.ignoreOut = false;
        this.tests = [];
        this.readLine();
    }

    readIOTest() {
        const line = this.reader.next();
        if(line === null) return;
        const inst = line.slice(0,3);
        const rest = line.slice(3);
        switch(inst) {
            case `${this.comment}>`:
                this.tests[this.testI].push(Test(IN, rest));
                return this.readIOTest();
            case `${this.comment}<`:
                this.tests[this.testI].push(Test(OUT, rest));
                return this.readIOTest();
            default:
                return this.readLine();
        }
    }

    readLine() {
        const line = this.reader.peek();
        
        if(line === null) return;
        const toggle = `${this.comment}/>.<\\\\\\`;
        if(line.startsWith(toggle)) {
            this.testI++;
            this.tests[this.testI] = [];
            const config = {
                inputonly: line.includes("inputonly"),
                name: line.slice(toggle.length).trim()
            }
            this.tests[this.testI].push(Config(config))
            return this.readIOTest();
        };
    
        this.reader.next();
        return this.readLine();
    }
    
}
class FileTestReader {
    constructor(reader, toggle="///>.<\\\\\\") {
        this.reader = reader;
        this.toggleLine = toggle;
        this.toggle = IN;
        this.tests = [];
        this.readLine();
    }

    readLine() {
        const line = this.reader.peek();
        
        if(line === null) return;
        this.reader.next();

        if(line.startsWith(this.toggleLine)) {
            this.toggle = +!this.toggle;
            return this.readLine();
        };

        this.tests.push(Test(this.toggle, line));
        
        return this.readLine();
    }
    
}

const filename = process.argv[2];
const classname = filename.split('.').slice(0,-1).join('.');
const testarg = parseInt(process.argv[3]);
let test;
if(process.argv[3] && isNaN(testarg)) {
    console.log(`Reading tests from ${process.argv[3]}`);
    const content = fs.readFileSync(process.argv[3], "utf-8");
    const lines = new Reader(content.split(NEWLINE).filter(line => line.length));
    const testReader = new FileTestReader(lines);
    test = testReader.tests;
} else {
    const content = fs.readFileSync(filename, "utf-8");
    const lines = new Reader(content.split(NEWLINE).filter(line => line.length));
    const testReader = new CommentTestReader(lines);
    test = testReader.tests[testarg || 0];
}



if(!test && process.argv[3]) {
    console.log(`Couldn't find test ${testarg}`);
}

const cmd = (s, ...args) => {
    console.log(`CMD: ${s.replace(JAVAPATH, "JAVAPATH/")} ${args[0].join(" ")}`);
    return spawn(s, ...args);
}


const run = () => {
    const runCmd = cmd(`${JAVAPATH}${JAVA}`, ["-classpath", OUTPATH, `${classname.replace(/\.\//g, "").replace(/\.\\/g, "").replace(/\\/g, ".").replace(/\//g, ".")}`]);
    console.time("TIME")
    let stdout = "";
    let stdoutq = [];
    let passed = [];
    let failed = [];
    let order = [];
    let inputonly = false;
    if(test) {
        for(let io of test) {
            switch(io.type) {
                case CONFIG:
                    inputonly = io.data.inputonly;
                    let name = io.data.name;
                    if(name && name.length > 0) {
                        console.log(`TEST: ${name}`)
                    }
                    break;
                case IN:
                    runCmd.stdin.write(io.data + NEWLINE, (err) => console.assert(!err, err));
                    break;
                case OUT:
                    stdoutq.push(io.data);
                    break;
            }
        }
    } else {
        process.stdin.pipe(runCmd.stdin);
        runCmd.stdout.pipe(process.stdout);
    }

    const testLine = (line) => {
        let result = (line == stdoutq[0] ? passed : failed).push({line, expected: stdoutq[0]});
        order.push(line == stdoutq[0]);
        stdoutq.shift();
        return result;
    };
    const consumeLine = (chunk) => {
        if(test) chunk.toString().split(NEWLINE).filter(line => line.length).forEach(line => testLine(line));
    }
    runCmd.stderr.on("data", (chunk) => {
        stdout+=chunk;
    })
    let line = []
    const delim = NEWLINEDELIM.charCodeAt(0)
    runCmd.stdout.on("data", (chunk) => {
        if(inputonly) {
            process.stdout.write(chunk);
            return;
        }
        for(let c of chunk) {
            line.push(c);
            if(c == delim) {
                consumeLine(String.fromCharCode(...line));
                line = []
            }
        }        
        stdout+=chunk;
    })
    const showTime = () => {
        console.timeEnd("TIME")
    }
    runCmd.on("close", (code) => {
        const endTime = process.hrtime.bigint();
        if(code !== 0) {
            process.stdout.write(stdout);
            return console.log(`${JAVAPATH}${JAVA} closed with exit code ${code}`)
        }
        if(!test || inputonly) return showTime();
        console.log(order.map(bool => bool ? "PASSED" : "FAILED").join(', '));
        console.log(`${passed.length} PASSED${passed.length != 0 ? `: ${passed.map(test => test.line)}` : ""}`);
        const failmap = failed.map(test => `${test.line}${test.expected !== undefined ? ` (expected ${test.expected})` : ''}`)
        console.log(`${failed.length} FAILED${failed.length != 0 ? `: ${failmap}` : ""}`);
        showTime()
    })
}

const compile = async () => {
    return new Promise((res, rej) => {
        const compileCmd = cmd(`${JAVAPATH}${JAVAC}`, ["-d", OUTPATH, `${classname}.java`]);
        let stdout = "";
        compileCmd.stderr.on("data", (chunk) => {
            stdout+=chunk;
        })
        compileCmd.stdout.on("data", (chunk) => {
            stdout+=chunk;
        })
        compileCmd.on("close", (code) => {
            if(code !== 0) {
                process.stdout.write(stdout);
                console.log(`${JAVAPATH}${JAVAC} closed with exit code ${code}`);
                return res(false);
            }
            run();
            return res(true);
        })
    })
}

const runIfSameHash = async () => {
    const hashPath = path.join(OUTPATH, "lastHash");
    let lastHash;
    try {
        lastHash = fs.readFileSync(hashPath, "utf-8");
    } catch(err) {
        
    }
    const file = fs.readFileSync(filename, "utf-8").split('\n').filter(line => !line.startsWith(COMMENT)).join('\n');
    const hash = crypto.createHash('sha1');
    hash.setEncoding('hex');
    hash.write(file);
    hash.end();
    let fileHash = hash.read();
    if(lastHash && (lastHash == fileHash)) return run();
    const compiled = await compile();
    if(!compiled) return;
    fs.writeFileSync(hashPath, fileHash);
};

runIfSameHash();
