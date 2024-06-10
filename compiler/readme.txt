* Install node, npm

* Install the dependencies for src/test.js
# npm install

* generate the benchmark set
for solc in v0.4.26+commit.4563c3fc v0.5.17+commit.d19bba13 v0.6.12+commit.27d51765 v0.7.6+commit.7338295f v0.8.24+commit.e11b9ed9; do
    node src/test.js $solc
    node src/test.js -o $solc
done

This generates the folders with the benchmark sets and the compilation results, as well as the summaries results.csv and results.json.
