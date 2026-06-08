## ADDED Requirements

### Requirement: User can list Yinxiang notebooks
The system SHALL allow users to view their Yinxiang notebooks for selection.

#### Scenario: List notebooks
- **WHEN** user opens Yinxiang settings or export notebook picker
- **THEN** the system calls `listNoteBooks` API
- **AND** displays notebook names with their GUIDs

### Requirement: User can list Yinxiang notes
The system SHALL allow users to browse their Yinxiang notes for import.

#### Scenario: List recent notes
- **WHEN** user triggers import from Yinxiang
- **THEN** the system calls `searchNotesByFilter` API without a keyword
- **AND** displays the 30 most recent notes with title, notebook, and tags

#### Scenario: Search notes by keyword
- **WHEN** user enters a search term in the import dialog
- **THEN** the system calls `searchNotesByFilter` API with the keyword
- **AND** displays matching notes

### Requirement: User can import a Yinxiang note into Obsidian
The system SHALL allow users to fetch a specific Yinxiang note and save it as a Markdown file in the vault.

#### Scenario: Successful import
- **WHEN** user selects a note from the Yinxiang note list
- **THEN** the system calls `getNoteDetail` API to fetch full content
- **AND** converts ENML content to Markdown
- **AND** creates a new `.md` file in the vault with the note title
- **AND** preserves tags as frontmatter

#### Scenario: Import with duplicate handling
- **WHEN** importing a note whose title already exists in the target folder
- **THEN** the system renames the new file with a numeric suffix (e.g., `Title (1).md`)

#### Scenario: Import failure
- **WHEN** the API call fails or the note content cannot be parsed
- **THEN** the system displays an error notice
- **AND** no partial file is left in the vault
