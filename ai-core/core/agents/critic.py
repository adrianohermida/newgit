from __future__ import annotations

from .contracts import CriticVerdict, ExecutionReport


class CriticAgent:
    """Validates execution completeness and consistency."""

    def validate(self, report: ExecutionReport) -> CriticVerdict:
        if not report.results:
            return CriticVerdict(status='fail', reason='No execution results were produced.', suggestion='Generate a non-empty plan.')

        unimplemented = [result for result in report.results if result.status == 'unimplemented']
        if unimplemented:
            unimplemented_ids = ', '.join(str(result.step_id) for result in unimplemented)
            return CriticVerdict(
                status='fail',
                reason=f'One or more steps rely on unimplemented or placeholder tools: {unimplemented_ids}.',
                suggestion='Implement the missing tool handlers or choose a supported execution path.',
            )

        failed = [result for result in report.results if result.status == 'fail']
        if failed:
            failed_ids = ', '.join(str(result.step_id) for result in failed)
            return CriticVerdict(
                status='retry',
                reason=f'One or more steps failed: {failed_ids}.',
                suggestion='Retry failed steps with additional context and safer tool parameters.',
            )

        retries = [result for result in report.results if result.status == 'retry']
        if retries:
            return CriticVerdict(status='retry', reason='Execution contains retry statuses.', suggestion='Retry incomplete steps.')

        if report.final_output in (None, '', {}):
            return CriticVerdict(status='fail', reason='Execution finished but final output is empty.', suggestion='Ensure at least one step produces output.')

        return CriticVerdict(status='ok', reason='Execution output is consistent and complete.', suggestion=None)
