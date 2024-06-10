import argparse, csv, os, sys, string, hashlib, json
import ethutils.ethutils.metadata as metadata

def main():
    argparser = argparse.ArgumentParser(
        prog="errors",
        description="extract compiler errors")
    argparser.add_argument("destination",
        metavar="DEST",
        type=str,
        help="csv file with errors")
    argparser.add_argument("sources",
        nargs="+",
        metavar="SRC",
        type=str,
        help="directory with json files")

    if len(sys.argv)==1:
        argparser.print_help(sys.stderr)
        sys.exit(1)

    args = argparser.parse_args()

    errorfile = open(args.destination, "x")
    errorcsv = csv.writer(errorfile)

    for source in args.sources:
        for path,_,files in os.walk(source):
            for f in files:
                if f.endswith(".json"):
                    sfn = os.path.join(path,f)
                    with open(sfn) as sf:
                        j = json.load(sf)
                    for e in j.get("errors",[]):
                        errorcsv.writerow((
                            sfn,
                            e["component"],
                            e.get("errorCode"),
                            e["message"],
                            e["severity"],
                            e["type"]
                        ))
    errorfile.close()


if __name__ == '__main__':
    sys.exit(main())
