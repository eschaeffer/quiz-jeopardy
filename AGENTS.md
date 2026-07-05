# AGENTS.md

## Planning Workspace Maintenance

This project uses a separate planning workspace at:

    ../JeopardyProject-Planning/

Keep that workspace synchronized with the actual implementation.

Update the planning workspace after any of these milestones:

- completing a meaningful feature;
- changing an architectural or technology decision;
- discovering or resolving a significant bug;
- changing current development priorities;
- reaching the end of a substantial work session;
- before handing the project to another model or agent.

Do not update the planning workspace after trivial edits, formatting changes,
or every individual tool action.

When an update is warranted:

1. Update `CURRENT_STATE.md` so it accurately reflects what presently works,
   what remains incomplete, and the immediate next step.
2. Add durable architectural choices to `DECISIONS.md`.
3. Add, update, or close entries in `ISSUES.md`.
4. Update `FEATURE_BACKLOG.md` when priorities or feature status change.
5. Append a concise dated entry to `SESSION_LOG.md`.

Documentation rules:

- Be concise.
- Record verified behaviour separately from assumptions or proposals.
- Do not paste source code, diffs, complete terminal output, or conversation transcripts.
- Do not claim that a feature works unless it was actually tested.
- Preserve useful existing history rather than rewriting it inaccurately.
- The source repository remains the authority for implementation details.
- Planning documents must never override inspection of the actual code.

## Curriculum Source Documents

For official curriculum source files such as PDFs or copied source extracts:

- Store the original source documents in the planning workspace by default.
- Use the planning workspace for source assessments, extraction rules, curation notes,
  and coder handoff prompts.
- Store only derived runtime artifacts in the coding workspace, such as curated JSON,
  retrieval code, and UI/runtime wiring.
- Coding agents may still inspect the original source documents when implementation
  requires direct validation against the source, but the planning workspace remains
  the canonical home for those source documents.

Before ending a substantial task, check whether one of the update conditions
above has been met. If so, update the planning workspace before giving the
final task summary.

When implementing work originating from the planning workspace:

- Answer all questions marked as requiring repository inspection.
- Record answers in the relevant implementation brief or planning document.
- After implementation, document:
  - what was changed;
  - what was actually tested;
  - whether acceptance criteria passed;
  - any deviations from the requested design;
  - newly discovered limitations or follow-up work.
- Update CURRENT_STATE.md, ISSUES.md, FEATURE_BACKLOG.md, DECISIONS.md, and
  SESSION_LOG.md as appropriate.
- Do not mark proposed behaviour as verified unless it was tested.
