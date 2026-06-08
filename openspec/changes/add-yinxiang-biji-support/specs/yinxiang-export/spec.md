## ADDED Requirements

### Requirement: User can export Obsidian notes to Yinxiang
The system SHALL allow users to export one or more Obsidian notes to their Yinxiang account.

#### Scenario: Export single note to default notebook
- **WHEN** user triggers "Export active note to Yinxiang"
- **AND** the note has a title and Markdown content
- **THEN** the system converts the Markdown to ENML-compatible HTML
- **AND** creates a new note in Yinxiang via the `createNoteFromMCP` API
- **AND** displays a success notice with the note title

#### Scenario: Export to specific notebook
- **WHEN** user has configured a default notebook GUID
- **AND** triggers export
- **THEN** the created note is placed in the specified notebook

#### Scenario: Export multiple notes
- **WHEN** user selects multiple notes via context menu
- **THEN** each note is exported sequentially to Yinxiang
- **AND** a summary notice shows succeeded/failed counts

#### Scenario: Export failure handling
- **WHEN** the Yinxiang API returns an error (e.g., invalid token, rate limit)
- **THEN** the system displays an error notice with the failure reason
- **AND** continues with remaining notes if multiple are selected

#### Scenario: Note title sanitization
- **WHEN** a note title contains characters invalid for Yinxiang (`/\\?%*:|"<>>`)
- **THEN** those characters are replaced with hyphens before creating the note
