Changes in response to the Obsidian community directory's automated review.

- Reads a `.bib` file outside your vault through Obsidian's own API instead of Node's file system module.
- Looks for existing notes in the note's own folder, and for an unset `.bib` file only at the top of the vault, instead of listing every file in the vault.
- Release files now come with GitHub artifact attestations, so you can verify they were built from this repository.
- No change to how notes, citations or sync behave.
