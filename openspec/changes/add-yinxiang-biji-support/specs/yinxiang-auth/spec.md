## ADDED Requirements

### Requirement: User can authenticate with Yinxiang
The system SHALL provide a mechanism for users to obtain and store a Yinxiang authentication token.

#### Scenario: Successful token configuration
- **WHEN** user enters a valid Yinxiang token (starting with `S=s`) in plugin settings
- **THEN** the system stores the token in the provider configuration
- **AND** the provider becomes available for use

#### Scenario: Invalid token rejection
- **WHEN** user enters a token that does not start with `S=s`
- **THEN** the system displays an error message indicating the token format is invalid
- **AND** the token is not saved

#### Scenario: Token validation on test
- **WHEN** user clicks "Test connection" in settings
- **THEN** the system calls the Yinxiang API to verify the token is active
- **AND** displays success or failure accordingly
