export default {
  // deno-lint-ignore no-explicit-any
  _parse_output: (workflowRunResponse: Record<string, any>) => {
    return workflowRunResponse.run
  },
}
