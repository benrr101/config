import getopt
import os
import subprocess
import sys
from azure.core.exceptions import ResourceNotFoundError
from azure.identity import DefaultAzureCredential
from azure.mgmt.dns import DnsManagementClient
from azure.mgmt.dns.models import ARecord, AaaaRecord, RecordSet, RecordType


def debug_log(message, is_verbose):
    if is_verbose:
        print(message)


def print_usage(error=None):
    if error is not None:
        print(error)
        print()

    print('Usage: update_dns.py -g resource_group_name -z zone_to_update -r record_to_update')
    print('Optional command line arguments:')
    print('    -v         verbose output')
    print('    --a        only updates A record')
    print('    --aaaa     only updates AAAA record')

    sys.exit(2 if error else 0)


def get_ip(is_ipv6, is_verbose):
    # Determine command line switch for desired protocol
    protocol = "6" if is_ipv6 else "4"

    debug_log(f"... Determining IPv{protocol} address...", is_verbose)

    # Make the call to curl
    curl = subprocess.Popen(
        ["curl", "-s", "-f", f"-{protocol}", "https://ipconfig.io"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    curl.wait(10)
    (stdout, stderr) = curl.communicate()
    if curl.returncode != 0:
        raise ValueError(f"Call to curl returned with code {curl.returncode}: {stderr}")

    # Parse the output
    ip_address = stdout.decode("ascii").strip()

    debug_log(f"... IPv{protocol} address was {ip_address}", is_verbose)

    return ip_address


def set_record(record_set, is_ipv6, ip_address):
    if is_ipv6:
        record_set.aaaa_records = [AaaaRecord(ipv6_address=ip_address)]
    else:
        record_set.a_records = [ARecord(ipv4_address=ip_address)]


def should_update(record_set, is_ipv6, ip_address):
    if is_ipv6 and record_set.aaaa_records is not None and len(record_set.aaaa_records) == 1 \
            and record_set.aaaa_records[0].ipv6_address == ip_address:
        return False
    if not is_ipv6 and record_set.a_records is not None and len(record_set.a_records) == 1 \
            and record_set.a_records[0].ipv4_address == ip_address:
        return False

    return True


def update_record(dns_client, resource_group, zone_name, record_name, is_ipv6, is_verbose):
    if is_ipv6:
        record_type = RecordType.AAAA
    else:
        record_type = RecordType.A

    try:
        ip_address = get_ip(is_ipv6, is_verbose)
        if ip_address:
            # Get existing record set, if any
            try:
                record_set = dns_client.record_sets.get(resource_group, zone_name, record_name, record_type)
                if not should_update(record_set, is_ipv6, ip_address):
                    print(f"No changes required for {record_type} record")
                    return

            except ResourceNotFoundError:
                debug_log(f"*** {record_type} records were not found, creating a new one...", is_verbose)
                record_set = RecordSet()
                record_set.ttl = 3600
                record_set.type = record_type

            debug_log(f"... Updating {record_type} record...", is_verbose)
            set_record(record_set, is_ipv6, ip_address)
            dns_client.record_sets.create_or_update(resource_group, zone_name, record_name, record_type, record_set)
            debug_log(f"... Updating {record_type} record successful.", is_verbose)

            print(f"Set {record_type} record for {record_name}.{zone_name} to point to {ip_address}")

        else:
            debug_log(f"*** Skipping {record_type} record update, address not available", is_verbose)

    except ValueError as ve:
        print(f"Failed to update {record_type} records", file=sys.stderr)
        print(ve, file=sys.stderr)


def main(argv):
    # Parse arguments
    resource_group = None
    zone_name = None
    record_name = None
    update_a = True
    update_aaaa = True
    verbose = False
    try:
        (opts, args) = getopt.getopt(argv[1:], "vz:r:g:", ["a", "aaaa"])
    except getopt.GetoptError as err:
        print_usage(f'Unexpected argument: {err.opt}')

    for (opt, arg) in opts:
        if opt == "-g":
            resource_group = arg
        elif opt == "-z":
            zone_name = arg
        elif opt == "-r":
            record_name = arg
        elif opt == "--a":
            update_aaaa = False
        elif opt == "--aaaa":
            update_a = False
        elif opt == "-v":
            verbose = True

    if resource_group is None:
        print_usage("Resource group name is required")

    if zone_name is None:
        print_usage("Zone name is required")

    if record_name is None:
        print_usage("Record name is required")

    if not (update_a or update_aaaa):
        print_usage("Incompatible argument combination --a + --aaaa")

    # Authenticate
    credential = DefaultAzureCredential()
    subscription_id = os.environ["AZURE_SUBSCRIPTION_ID"]
    dns_client = DnsManagementClient(credential, subscription_id)

    # Update A records
    if update_a:
        update_record(dns_client, resource_group, zone_name, record_name, False, verbose)
    else:
        debug_log("*** Skipping A record update", verbose)

    # Update AAAA records
    if update_aaaa:
        update_record(dns_client, resource_group, zone_name, record_name, True, verbose)
    else:
        debug_log("*** Skipping AAAA record update", verbose)


if __name__ == "__main__":
    main(sys.argv)
