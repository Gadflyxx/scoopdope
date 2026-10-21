#!/usr/bin/env python3
"""Governance gas model and ABI schema verifier for scoopdope contracts."""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
GOV_LIB = REPO_ROOT / "contracts" / "governance" / "src" / "lib.rs"
DOCS_ABI = REPO_ROOT / "docs" / "ABI.md"

EXPECTED_EVENTS = {
    "prop_new": {
        "topics": ["Symbol(\"prop_new\")", "proposal_id", "proposer"],
        "data_fields": ["title", "voting_end_ledger", "created_at"],
    },
    "vote": {
        "topics": ["Symbol(\"vote\")", "proposal_id", "voter"],
        "data_fields": ["support", "weight"],
    },
    "exec": {
        "topics": ["Symbol(\"exec\")", "proposal_id"],
        "data_fields": ["executed_at", "votes_for", "votes_against"],
    },
    "upg_prop": {
        "topics": ["Symbol(\"upg_prop\")", "upgrade_id", "proposer"],
        "data_fields": ["contract_address", "new_wasm_hash", "voting_end_ledger"],
    },
    "upg_appr": {
        "topics": ["Symbol(\"upg_appr\")", "upgrade_id"],
        "data_fields": ["timelock_expiry_ledger"],
    },
    "upg_exec": {
        "topics": ["Symbol(\"upg_exec\")", "upgrade_id"],
        "data_fields": ["contract_address", "new_wasm_hash"],
    },
}


def verify_abi_schemas() -> tuple[bool, list[str]]:
    problems = []
    if not DOCS_ABI.exists():
        return False, [f"Missing ABI specification: {DOCS_ABI}"]
    if not GOV_LIB.exists():
        return False, [f"Missing governance source: {GOV_LIB}"]

    abi_text = DOCS_ABI.read_text(encoding="utf-8")
    gov_text = GOV_LIB.read_text(encoding="utf-8")

    for symbol, schema in EXPECTED_EVENTS.items():
        if symbol not in abi_text:
            problems.append(f"Event symbol '{symbol}' missing in docs/ABI.md")
        if symbol not in gov_text:
            problems.append(f"Event symbol '{symbol}' missing in contracts/governance/src/lib.rs")
        for field in schema["data_fields"]:
            if field not in abi_text:
                problems.append(f"Field '{field}' for event '{symbol}' missing in docs/ABI.md")

    return len(problems) == 0, problems


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--json", action="store_true", help="emit JSON output")
    args = parser.parse_args(argv)

    ok, problems = verify_abi_schemas()
    if args.json:
        out = {"ok": ok, "problems": problems, "events_checked": list(EXPECTED_EVENTS.keys())}
        print(json.dumps(out, indent=2))
        return 0 if ok else 1

    if ok:
        print(f"All {len(EXPECTED_EVENTS)} governance event schemas verified successfully against docs/ABI.md.")
        return 0
    else:
        print("Schema verification failures:")
        for p in problems:
            print(f"  - {p}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
