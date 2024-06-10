console.time('Time elapsed: ');

const { program } = require('commander');
const { parse: csvParse } = require('csv-parse/sync');
const { stringify: csvStringify } = require('csv-stringify/sync');
const fs = require('fs');
const ganache = require("ganache");
const Web3 = require('web3');
const Mustache = require('mustache');
let solc = require('solc');


program.option('-o, --optimize');
program.parse();
const optimize = !!program.opts().optimize;

const wheelAnimation = ['|', '/', '-', '\\'];

const compilerVersionLong = program.args[0] ?? 'v0.8.21+commit.d9974bed';
const regex = /v(\d+\.\d+\.\d+)\+commit.*/gm; // regex to extract short compiler version from long one
const compilerVersionShort = regex.exec(compilerVersionLong)[1]; // extract short compiler version
console.info(`Testing with version ${compilerVersionShort} (${compilerVersionLong})${optimize ? ' and optimization' : ''}\n`);
let compileCounter = 0, contractCounter = 0;

const template = fs.readFileSync(`${__dirname}/template.mustache`, 'utf-8');

const web3 = new Web3.Web3(ganache.provider({logging: {logger: {log: () => {}}}}));

const types = csvParse(
    fs.readFileSync(`${__dirname}/types.csv`, { encoding: 'utf-8' }),
    {
        delimiter: ';',
        columns: true,
        cast: (value, context) => {
            if (typeof context.column === 'string' && context.column.includes('tags') && value !== undefined) return JSON.parse(value);
            else return value;
        }
    }
);

const bugs = csvParse(
    fs.readFileSync(`${__dirname}/bugs.csv`, { encoding: 'utf-8' }),
    {
        delimiter: ';',
        columns: true,
        cast: (value, context) => {
            if (typeof context.column === 'string' && context.column.includes('tags') && value !== undefined) return JSON.parse(value);
            else return value;
        }
    }
);


// get solc instance with correct compiler version
solc.loadRemoteVersion(compilerVersionLong, async function (err, solcSnapshot) {
    if (err) {
        console.error(`Error getting solc version ${compilerVersionLong}`);
        process.exit();
    } else {

        const compilerVersionName = compilerVersionShort + (optimize ? 'opt' : '');
	
        const accounts = await web3.eth.getAccounts();

        let resultsJson = {};
        if (fs.existsSync('results.json')) {
            resultsJson = JSON.parse(fs.readFileSync('results.json', { encoding: 'utf-8' }));
        }

        let resultsCsv = [];
        if (fs.existsSync('results.csv')) {
            resultsCsv = csvParse(
                fs.readFileSync('results.csv', {encoding: 'utf-8'}),
                { delimiter: ';', columns: true }
            );
        }

        //loop 1: types
        for (const type of types) {
	    
            const type_view = {
                type: type.type,
                type_max_val: type.max_value,
                type_min_val: type.min_value
            };

            //loop2: bugs
            for (const bug of bugs) {
                //check if type is applicable to bug
                if (!bug.type_tags.some(bug_t_tag => type.tags.includes(bug_t_tag))) continue;
		
                contractCounter++;
                process.stdout.write(`${contractCounter} contracts ${wheelAnimation[compileCounter % wheelAnimation.length]} \r`);

                const result = {};
		const bug_name = Mustache.render(bug.name, type_view);
		const bug_description = Mustache.render(bug.description, type_view);
		const bug_code = Mustache.render(bug.code, type_view);
                const contractName = bug_name
                const bug_view = {
                    compilerVersion: compilerVersionShort,
                    contractName,
                    code: bug_code,
                    type: type.type
                }

                // assemble contract
                const contractCode = Mustache.render(template, bug_view);
            
                const compileInput = {
                    language: 'Solidity',
                    sources: { [`${contractName}.sol`]: { content: contractCode } },
                    settings: { 
                        outputSelection: { '*': { '*': ['*'] } },
                        optimizer: {
                            enabled: optimize,
                            runs: 200
                        },
                    }
                };
            
                //const outputDir = `./contracts/${compilerVersionName}/${bug_name}`;
                const outputDir = `./contracts-${compilerVersionName}`;
                fs.mkdirSync(outputDir, { recursive: true }); // create directory
                fs.writeFileSync(`${outputDir}/${contractName}.sol`, contractCode); // contract sourcecode
		
                // compile sourcecode
                const output = JSON.parse(solcSnapshot.compile(JSON.stringify(compileInput)));
                fs.writeFileSync(`${outputDir}/${contractName}.json`, JSON.stringify(output, null, 2)); // pretty-print complete compiler output

                if(!output.errors) {
                    // successfully compiled
                    compileCounter++;
		    
                    const compiled = output.contracts[`${contractName}.sol`][contractName];
                    
                    //fs.writeFileSync(`${outputDir}/${contractName}.hex`, compiled.evm.bytecode.object); // hex bytecode
                    //fs.writeFileSync(`${outputDir}/${contractName}.rt.hex`, compiled.evm.deployedBytecode.object); // deployment bytecode
                    //fs.writeFileSync(`${outputDir}/${contractName}.asm`, compiled.evm.bytecode.opcodes); // assembly
                    //fs.writeFileSync(`${outputDir}/${contractName}_abi.json`, JSON.stringify(compiled.abi)); // ABI

                    result.compiled = true;

                    const contract = new web3.eth.Contract(compiled.abi);

                    const deployed = await contract
                            .deploy({data: compiled.evm.bytecode.object})
                            .send({from: accounts[0], gas: '10000000'});

                    try {
                        // successful call with return value
                        const call = await deployed.methods.test().call();

                        result.status = 'success';
                        result.returnValue = call.toString();

                    } catch(e) {
                        // call reverted
                        result.status = 'revert';
                        result.message = e.message;
                    }
                
                } else {
                    // error while compiling
                    result.compiled = false;
                    result.errorMessage = output.errors[0].formattedMessage;
                }

                if (!resultsJson[bug_name]) {
                    resultsJson[bug_name] = {
                        name: bug_name,
                        description: bug_description,
                        tests: {}
                    };
                }

                resultsJson[bug_name].tests[compilerVersionName] = result;

                let i = resultsCsv.findIndex(el => el.name === bug_name);
                if (i === -1) i = resultsCsv.push({ name: bug_name }) - 1;

                let csvText = '';
                if (!result.compiled) csvText = 'Compiler Error';
                else if (result.status === 'revert') csvText = 'revert';
                else csvText = result.returnValue;
            
                resultsCsv[i][compilerVersionName] = csvText;

                //break; //loop2: types
            };
        
            //break; //loop1: bugs
        };

        fs.writeFileSync('results.json', JSON.stringify(resultsJson, null, 2));

        fs.writeFileSync('results.csv', csvStringify(resultsCsv, { header: true, delimiter: ';'}));

        console.info(`Processed ${contractCounter} contracts, of which ${compileCounter} compiled successfully.`);
        console.info('Results written to \'results.json\' and \'results.csv\'.\n');
        console.timeEnd('Time elapsed: ');
    }
});
