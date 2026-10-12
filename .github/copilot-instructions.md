# Testing Workflow
- For every implementation request, identify the relevant tests and create or update them to express the requested behavior before changing the implementation. Run those tests first when practical and confirm they fail for the expected reason.
- After implementation, review the relevant test files, update them to match the final behavior, and run the focused tests. Report the results and any checks that could not be run.
- In this repository, use `npm test` for the test suite and `npm run test:coverage` to check configured per-file JavaScript coverage thresholds.
- For core functionality, ensure that the essential tests are always up-to-date and passing before making any changes to the implementation.
- Create MD files for new features or significant changes to document their usage and behavior. also update existing documentation as needed.
- Ensure that any changes to environment variables or configuration files are reflected in the documentation.