# plsbuild
Script for building and testing Java competitive programming code

# Running
```sh
node plsbuild [.java file] [test index or file]
```

# Configuration
The jdk path, javac and java binary name can be changed in the first lines of the script.<br>
The script checks the hash of the .java file to determine if it should be compiled again or not. To disable this change the `runIfSameHash` function call at the end of the code to `compile`

# Defining tests
## In the .java file
`///>.<\\\` - Indicates that a test definition follows. Test definitions can be placed anywhere in the code<br>
`//>` - Everything after `//>` will be sent as input to the program when running<br>
`//<` - Defines that everything after `//<` is expected as output from the program<br>
<br>
If a line that is not `//>` or `//<` follows after a test definition, the test definition will end. A file can have any number of test definitions.
### Example
```java
///>.<\\\
//>3
//>1 1 1
//>1 0 1
//>0 1 0
//<2
public class Main {
    public static void main(String[] args) {
        ...
        ///>.<\\\
        //>2
        //>1 1 1
        //>1 0 0
        //<1
    } 
    
}
///>.<\\\
//>1
//>0 0 0
//<0
```
The first test definition gives the lines `3`, `1 1 1`, `1 0 1` and `0 1 0` to the program as input, and expects to get `2` as output. This test can be run with:
```
node plsbuild Main.java
```
or
```
node plsbuild Main.java 0
```
To run the second test definition:
```
node plsbuild Main.java 1
```
### In a file
`///>.<\\\` - Toggles Input or Output for the following lines. File starts with Input.
#### Example
> test.txt
```3
1 1 1
1 0 1
0 1 0
///>.<\\\
2
```
This test definition gives the lines `3`, `1 1 1`, `1 0 1` and `0 1 0` to the program as input, and expects to get `2` as output. This test can be run with:
```
node plsbuild Main.java /path/to/test.txt
```
