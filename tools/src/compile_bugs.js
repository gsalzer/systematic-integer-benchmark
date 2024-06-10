console.time('Time elapsed: ');

const { program } = require('commander');
const { parse: csvParse } = require('csv-parse/sync');
const fs = require('fs');
const Mustache = require('mustache');
let solc = require('solc');


program.option('-o, --optimize');
program.parse();
const optimize = !!program.opts().optimize;

const wheelAnimation = ['|', '/', '-', '\\'];

const compilerVersionLong = program.args[0] ?? 'v0.8.24+commit.e11b9ed9';
const regex = /v(\d+\.\d+\.\d+)\+commit.*/gm; // regex to extract short compiler version from long one
const compilerVersionShort = regex.exec(compilerVersionLong)[1]; // extract short compiler version
const regexXS = /v(\d+\.\d+)\.\d+\+commit.*/gm; // regex to extract compiler major/minor version
const compilerVersionXS = regexXS.exec(compilerVersionLong)[1]; // extract extra short compiler version
console.info(`Running with version ${compilerVersionShort} (${compilerVersionLong})${optimize ? ' and optimization' : ''}\n`);
let compileCounter = 0, contractCounter = 0;


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

const sources = csvParse(
    fs.readFileSync(`${__dirname}/sources.csv`, { encoding: 'utf-8' }),
    { delimiter: ';', columns: true }
);

const operations = csvParse(
    fs.readFileSync(`${__dirname}/operations.csv`, { encoding: 'utf-8' }),
    {
        delimiter: ';',
        columns: true,
        cast: (value, context) => {
            if (typeof context.column === 'string' && context.column.includes('tags') && value !== undefined) return JSON.parse(value);
            else return value;
        }
    }
);

const sinks = csvParse(
    fs.readFileSync(`${__dirname}/sinks.csv`, { encoding: 'utf-8' }),
    {
        delimiter: ';',
        columns: true,
        cast: (value, context) => {
            if (typeof context.column === 'string' && context.column.includes('tags') && value !== undefined) return JSON.parse(value);
            else return value;
        }
    }
);

function load_template(base, suffixes) {
    for (const s of suffixes) {
        try {
            return fs.readFileSync(`${__dirname}/${base}_${s}_template.mustache`, 'utf-8');
        } catch {
            continue;
        }
    }
    return fs.readFileSync(`${__dirname}/${base}_template.mustache`, 'utf-8');
}


// get solc instance with correct compiler version
solc.loadRemoteVersion(compilerVersionLong, async function (err, solcSnapshot) {
    if (err) {
        console.error(`Error getting solc version ${compilerVersionLong}`);
        process.exit();
    } else {

        const compilerVersionName = compilerVersionShort + (optimize ? 'opt' : '');

        let template;
        // do everything twice; first put bugs into constructor, then also into function
        // loop 0: template type
        for (const template_type of ['constructor', 'function']) {
            template = load_template(template_type, [compilerVersionShort, compilerVersionXS]);

            //loop 1: types
            for (const type of types) {

                //loop 2: sources
                for (const source of sources) {

                    //loop 3: operations
                    for (const operation of operations) {
                        //check if operation is applicable to type
                        if (!operation.type_tags.some(op_tag => type.tags.includes(op_tag))) continue;

                        //loop 4: sinks
                        for (const sink of sinks) {
                            //check if operation is applicable to type
                            if (!sink.type_tags.some(sink_t_tag => type.tags.includes(sink_t_tag))) continue;
                            //check if operation is applicable to compiler version
                            if (!sink.version_tags.some(sink_v_tag => sink_v_tag === 'all' || compilerVersionShort.startsWith(sink_v_tag))) continue;
                            //check if operation is applicable to location (function or constructor)
                            if (!sink.location_tags.some( sink_l_tag =>
                                    sink_l_tag.includes('all') || sink_l_tag.includes(template_type) 
                                )) continue;

                            contractCounter++;
                            process.stdout.write(`${contractCounter} contracts ${wheelAnimation[compileCounter % wheelAnimation.length]} \r`);

                            const contractName = `v${compilerVersionShort.split('.').join('') + (optimize ? 'opt' : '')}_${template_type}_${type.type}_${source.id}_${operation.id}_${sink.id}`;

                            const view = {
                                compilerVersion: compilerVersionShort,
                                contractName,
                                source_contract_level_code: source.contract_level_code,
                                sink_contract_level_code: sink.contract_level_code,
                                source_constructor_argument_code: source.constructor_argument_code,
                                source_constructor_body_code: source.constructor_body_code,
                                source_function_argument_code: source.function_argument_code,
                                sink_function_modifier_code: sink.function_modifier_code,
                                type: type.type,
                                type_max_val: type.max_value,
                                type_min_val: type.min_value,
                                source_function_body_code: source.function_body_code,
                                operation_function_body_code: operation.code,
                                sink_function_body_code: sink.function_body_code
                            };

                            // if in constructor loop and both constructor and function argument code are not empty, add a comma between them
                            if (template_type == 'constructor' && source.constructor_argument_code.length > 0 && source.function_argument_code > 0) {
                                view.source_function_argument_code = ', ' + view.source_function_argument_code;
                            }

                            // render template two times, to resolve nested variables
                            let contractCode = Mustache.render(template, view);
                            contractCode = Mustache.render(contractCode, view);

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

                            //const outputDir = `./contracts/${contractName}`;
                            const outputDir = `./contracts-${compilerVersionName}`;
                            fs.mkdirSync(outputDir, { recursive: true }); // create directory
                            fs.writeFileSync(`${outputDir}/${contractName}.sol`, contractCode); // contract sourcecode

                            // compile sourcecode
                            const output = JSON.parse(solcSnapshot.compile(JSON.stringify(compileInput)));
                            fs.writeFileSync(`${outputDir}/${contractName}.json`, JSON.stringify(output, null, 2)); // pretty-print complete compiler output

                            if (!output.errors || output.errors.every(error => error.severity !== 'error')) {
                                // successfully compiled
                                compileCounter++;

                                //const compiled = output.contracts[`${contractName}.sol`][contractName];
                                //fs.writeFileSync(`${outputDir}/${contractName}.hex`, compiled.evm.bytecode.object); // hex bytecode
                                //fs.writeFileSync(`${outputDir}/${contractName}.rt.hex`, compiled.evm.deployedBytecode.object); // deployment bytecode
                                //fs.writeFileSync(`${outputDir}/${contractName}.asm`, compiled.evm.bytecode.opcodes); // assembly

                            } else {
                                // error while compiling
                                console.log(contractCode);
                                console.log(output.errors)
                            }
        //                    break; // sinks
                        }
        //                break; // operations
                    }
        //            break; // sources
                }
        //        break; // types
            }
        //    break; // constructor/functor
        }

        console.info(`Proessed ${contractCounter} contracts, of which ${compileCounter} compiled successfully.`);
        console.timeEnd('Time elapsed: ');
    }
});
