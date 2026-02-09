#!/usr/bin/env python3
"""Entry point for the relay server."""

import sys
import argparse

# Add the project directory to the path for imports
sys.path.insert(0, '/opt/clawd/projects/relay')

from relay.server import run_server
from relay.config import DEFAULT_PORT


def main():
    parser = argparse.ArgumentParser(description="Chat Relay Server")
    subparsers = parser.add_subparsers(dest='command')

    # Server command
    server_parser = subparsers.add_parser('server', help='Run the relay server')
    server_parser.add_argument('-p', '--port', type=int, default=DEFAULT_PORT,
                               help=f'Port to run on (default: {DEFAULT_PORT})')

    args = parser.parse_args()

    if args.command == 'server':
        run_server(args.port)
    else:
        # Default to server mode if no command given
        parser.print_help()


if __name__ == "__main__":
    main()
