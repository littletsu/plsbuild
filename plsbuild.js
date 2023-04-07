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

const IN = 0;
const OUT = 1;
const NEWLINE = "\r\n";

class CommentTestReader {
    constructor(reader, comment="//") {
        this.reader = reader;
        this.comment = comment;
        this.testI = -1;
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
        
        if(line.startsWith(`${this.comment}/>.<\\\\\\`)) {
            this.testI++;
            this.tests[this.testI] = [];
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

const JAVAPATH = "C:\\Users\\pc\\Desktop\\openjdk-19.0.1_windows-x64_bin\\jdk-19.0.1\\bin\\";
const JAVAC = "javac.exe";
const JAVA = "java.exe";
const OUTPATH = "./out";
const cmd = (s, ...args) => {
    console.log(`CMD: ${s.replace(JAVAPATH, "JAVAPATH/")}`);
    return spawn(s, ...args);
}


const run = () => {
    const runCmd = cmd(`${JAVAPATH}${JAVA}`, ["-classpath", OUTPATH, `${classname}`]);
    let stdout = "";
    let stdoutq = [];
    let passed = [];
    let failed = [];

    if(test) {
        for(let io of test) {
            switch(io.type) {
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
        let result = (line == stdoutq[0] ? passed : failed).push(line);
        stdoutq.shift();
        return result;
    };
    runCmd.stderr.on("data", (chunk) => {
        stdout+=chunk;
    })
    runCmd.stdout.on("data", (chunk) => {
        if(test) chunk.toString().split(NEWLINE).filter(line => line.length).forEach(line => testLine(line));
        
        stdout+=chunk;
    })
    runCmd.on("close", (code) => {
        if(code !== 0) {
            process.stdout.write(stdout);
            return console.log(`${JAVAPATH}${JAVA} closed with exit code ${code}`)
        }
        if(!test) return;
        console.log(`${passed.length} PASSED: ${passed}`);
        console.log(`${failed.length} FAILED: ${failed}`);
    })
}

const compile = () => {
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
            return console.log(`${JAVAPATH}${JAVAC} closed with exit code ${code}`)
        }
        return run();
    })
}

const runIfSameHash = () => {
    const hashPath = path.join(OUTPATH, "lastHash");
    let lastHash;
    try {
        lastHash = fs.readFileSync(hashPath, "utf-8");
    } catch(err) {
        
    }
    const fd = fs.createReadStream(filename);
    const hash = crypto.createHash('sha1');
    hash.setEncoding('hex');
    
    fd.on('end', function() {
        hash.end();
        let fileHash = hash.read();
        fs.writeFileSync(hashPath, fileHash);
        if(lastHash && (lastHash == fileHash)) return run();
        return compile();
    });
    
    fd.pipe(hash);
}

runIfSameHash();
