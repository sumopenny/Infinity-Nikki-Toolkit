# Nikki Tracker Catalog Snapshot

These compact catalogs and outfit name translations are from [dastrokes/gongeo.us-nikki-tracker](https://github.com/dastrokes/gongeo.us-nikki-tracker), game version 2.10.1, generated 2026-09-23. They supply outfit relations, item dye areas and palette unlock ordering that are not included in the public `/v1/items` and `/v1/outfits` detail responses. The app continues to request item and outfit detail data from `https://data.gongeo.us/v1`.

The source project is licensed under MIT; its license is included in this directory. Refresh these catalog and locale files together from the upstream project when updating the mapping snapshot.

Run `npm run resources:update:gongeo` to check the upstream catalog. The updater reads only the remote source; it never falls back to a neighboring checkout. Failed downloads keep the existing project snapshot. With `--strict`, the command also exits unsuccessfully.

`catalogSource.json` records the source URL, game version and generation time of the verified snapshot. Older versions, older snapshots within the same version, missing files, invalid records, empty translations, incorrect SHA-256/byte counts, and changes removing more than 2% of a file's existing IDs or translation keys are rejected before any data is written. All downloads and validations complete first, and the remote index is checked again before writing. Same-version content corrections are allowed. Metadata is recorded after the catalog files; identical content is not rewritten.

Startup logs distinguish successful remote synchronization, an unchanged snapshot, a rejected older snapshot, invalid data, and a failed remote request. Network error logs include the underlying cause when available. This check does not make DNS or proxy configuration changes.
