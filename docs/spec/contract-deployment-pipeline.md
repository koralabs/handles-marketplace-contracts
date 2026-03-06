# Contract Deployment Pipeline Spec

## Repository Scope
This repo owns the desired on-chain deployment state for marketplace contracts and related validator settings.

The repo should define what ought to be live on `preview`, `preprod`, and `mainnet`. It should not be treated as the storage location for volatile live references such as current settings UTxO refs.

## State Model
- Desired state lives in committed YAML files in this repo.
- Observed live state is read from chain UTxOs and deployed script hashes.
- Operational automation config lives outside this repo in orchestration/control-plane repos.
- Volatile fields such as `tx_hash`, `output_index`, and current UTxO refs belong in observed-state artifacts, not committed desired-state YAML.

## Desired State Files
The intended layout is:

```text
deploy/<network>/<contract_slug>.yaml
```

Each file should contain stable desired state only:

```yaml
schema_version: 1
network: preview
contract_slug: marketplace
build:
  target: validators/marketplace.ak
  kind: validator
  parameters:
    marketplace_address: addr_test1...
    authorizers:
      - <pub_key_hash>
subhandle_strategy:
  namespace: handlecontracts
  format: contract_slug_ordinal
settings:
  type: marketplace_settings
  values:
    marketplace_address: addr_test1...
    authorizers:
      - <pub_key_hash>
```

Required stable fields:
- `schema_version`
- `network`
- `contract_slug`
- `build.target`
- `build.kind`
- `build.parameters`
- `subhandle_strategy.namespace`
- `subhandle_strategy.format`
- `settings.type`
- `settings.values`

For marketplace deployments, the desired YAML must carry the full validator parameter set in `build.parameters`. Today that means:
- `build.parameters.marketplace_address`
- `build.parameters.authorizers`

Those same stable values should also appear in `settings.values` because they are part of the repo-owned desired on-chain marketplace settings datum.

Observed-only fields that must not be committed into desired-state YAML:
- `current_script_hash`
- `current_settings_utxo_ref`
- `current_subhandle`
- `observed_at`
- `last_deployed_tx_hash`

The initial bootstrap job may populate these files from current chain state, but it must strip live-only references before commit.

## Drift Detection
Deployment automation should:
- build the contract and derive the expected script hash,
- load desired YAML from this repo,
- read live chain state for the contract settings UTxO,
- classify drift as `script_hash_only`, `settings_only`, or `script_hash_and_settings`.

The expected script hash must be derived from committed `build.parameters`, not from operator-supplied workflow inputs.

No deployment artifact should be created when desired and live state already match.

## SubHandle Rules
- A script hash change requires a new SubHandle in the format `<contract_slug><ordinal>@handlecontracts`.
- A settings-only change reuses the current SubHandle and moves it forward with the settings UTxO.
- The next ordinal must be derived from live chain state, not a repo-local counter.

## Artifact Contract
The deployment workflow for this repo should emit:
- `deployment-plan.json`
- `summary.md`
- `summary.json`
- one or more `tx-XX.cbor` artifacts
- optional observed-state snapshot artifacts for debugging and audit

The canonical observed-state artifact should be JSON and should include:

```json
{
  "schema_version": 1,
  "repo": "handles-marketplace-contracts",
  "network": "preview",
  "contract_slug": "marketplace",
  "current_script_hash": "<hash>",
  "current_settings_utxo_ref": "<tx>#<ix>",
  "current_subhandle": "marketplace1@handlecontracts",
  "settings": {
    "type": "marketplace_settings",
    "values": {}
  },
  "observed_at": "<iso8601>"
}
```

If more than one transaction is required, the plan artifact must encode execution order and dependencies.

## Human Approval Boundary
Automation prepares deployment transactions and summaries.

Humans remain responsible for:
- downloading CBOR artifacts,
- uploading/signing/submitting in Eternl,
- approving the deployment at the wallet boundary.

Post-submit automation should verify that chain state converges to the desired YAML plus the expected SubHandle transition.
