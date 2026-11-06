# Nikki Tracker Catalog Snapshot

These catalogs and name translations come from the GitHub repository [dastrokes/gongeo.us-nikki-tracker](https://github.com/dastrokes/gongeo.us-nikki-tracker). See catalogSource.json for the current version. Outfit descriptions are loaded from the locally extracted bilingual snapshots; runtime code does not request the upstream detail API.

The source project is licensed under MIT; its license is included in this directory. Refresh these catalog and locale files together from the upstream project when updating the mapping snapshot.

The bilingual `item.json` and `makeup.json` files are shared directly by the frontend. No merged name JSON is generated. Makeup translations must have matching Chinese/English IDs, and updates removing any existing makeup ID are rejected before writing.

Run `npm run resources:update:gongeo` to check the upstream catalog. The updater reads only the remote source; it never falls back to a neighboring checkout. Failed downloads keep the existing project snapshot. With `--strict`, the command also exits unsuccessfully.

`catalogSource.json` records the source URL, game version and generation time of the verified snapshot. Older versions, older snapshots within the same version, missing files, invalid records, empty translations, incorrect SHA-256/byte counts, and changes removing more than 2% of a file's existing IDs or translation keys are rejected before any data is written. All downloads and validations complete first, and the remote index is checked again before writing. Same-version content corrections are allowed. Metadata is recorded after the catalog files; identical content is not rewritten.

Startup logs distinguish successful remote synchronization, an unchanged snapshot, a rejected older snapshot, invalid data, and a failed remote request. Network error logs include the underlying cause when available. This check does not make DNS or proxy configuration changes.
