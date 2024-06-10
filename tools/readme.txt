* Install node, npm, python3, smartbugs

* Install the dependencies for src/compile_bugs.js by running
# npm install

* Install ethutils
# python3 -m venv venv
# . venv/bin/activate
# pip install cbor2
# git clone https://github.com/gsalzer/ethutils

* generate the benchmark set
# node src/compile_bugs.js v0.4.26+commit.4563c3fc
# node src/compile_bugs.js v0.8.24+commit.e11b9ed9
The result are folders 'contracts-0.4.26' and 'contracts-0.8.24', each with 174768 json and as many sol files.

* To analyze compiler errors, run
# python3 errors.py errors-0.4.26.csv contracts-0.4.26
# python3 errors.py errors-0.8.24.csv contracts-0.8.24

* To generate the hex files with zeroed metadata, run
# python3 zeroMeta.py contracts0 contracts-0.4.26.csv contracts-0.4.26
# python3 zeroMeta.py contracts0 contracts-0.8.24.csv contracts-0.8.24
Now contracts0 contains 61526 runtime codes and 20060 deployment codes.
contracts-0.4.26.csv and contracts-0.8.24.csv associate each contract of the benchmark set with the codes in contracts0.

* Run Smartbugs on the contracts in contracts0
smartbugs -c integer_bugs.yaml
results2csv -p results/osiris > osiris.csv
results2csv -p results/mythril-0.23.15 > mythril.csv

* Now analyze the data in contracts-0.4.26.csv, contracts-0.8.24.csv, osiris.csv and mythril.csv
