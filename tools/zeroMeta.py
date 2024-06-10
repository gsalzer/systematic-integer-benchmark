import argparse, csv, os, sys, string, hashlib, json
import ethutils.ethutils.metadata as metadata

def process_code(name, hex, is_runtime, destination, mapcsv):
    bin = bytes.fromhex(hex)
    bin0,_ = metadata.zeroMetadata(bin)
    bin_hash = hashlib.md5(bin).digest().hex()
    bin0_hash = hashlib.md5(bin0).digest().hex()
    fnbin0 = f"{bin0_hash}{'.rt' if is_runtime else ''}.hex"
    tags = name.split('_')
    assert len(tags) == 6
    ptags = f"{{{','.join(tags)}}}"
    mapcsv.writerow((name,is_runtime,fnbin0,bin_hash,bin0_hash,ptags)+tuple(tags))
    with open(f"{destination}/{fnbin0}","w") as f:
        f.write(bin0.hex())

def main():
    argparser = argparse.ArgumentParser(
        prog="zeroMeta",
        description="Replace metadata sections by zero bytes")
    argparser.add_argument("destination",
        metavar="DEST",
        type=str,
        help="directory for contracts with zeroed metadata")
    argparser.add_argument("mapping",
        metavar="FILE",
        type=str,
        help="csv file mapping input to output contracts")
    argparser.add_argument("sources",
        nargs="+",
        metavar="SRC",
        type=str,
        help="directory with json files")

    if len(sys.argv)==1:
        argparser.print_help(sys.stderr)
        sys.exit(1)

    args = argparser.parse_args()

    mapping = open(args.mapping, "x")
    mapcsv = csv.writer(mapping)
    assert os.path.isdir(args.destination)

    for source in args.sources:
        for path,_,files in os.walk(source):
            for f in files:
                if f.endswith(".json"):
                    sfn = os.path.join(path,f)
                    with open(sfn) as sf:
                        j = json.load(sf)
                    assert len(j["contracts"]) == 1
                    for sol,contracts in j["contracts"].items():
                        break
                    assert len(contracts) == 1
                    for name,artefacts in contracts.items():
                        break
                    bc_hex = artefacts["evm"]["bytecode"]["object"]
                    process_code(name, bc_hex, False, args.destination, mapcsv)
                    rc_hex = artefacts["evm"]["deployedBytecode"]["object"]
                    process_code(name, rc_hex, True, args.destination, mapcsv)

    mapping.close()


if __name__ == '__main__':
    sys.exit(main())
