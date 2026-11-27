/** Production deployments must never silently compile out diagnostics. No database or network access. */
export function assertDiagnosticsBuild(env, command = 'build') {
  const production = env.ERROR_DEPLOYMENT_ENV === 'production' || env.CF_PAGES_BRANCH === 'main'
  if (command === 'build' && production && env.VITE_ERROR_REPORTING_ENABLED !== 'true') {
    throw new Error(
      '[diagnostics-build] Production requires VITE_ERROR_REPORTING_ENABLED=true at build time. ' +
        'Configure the Pages Builds production environment and rebuild. ' +
        'Use ERROR_REPORTING_ENABLED=false at runtime for an emergency server-side stop.'
    )
  }
  return { production, enabled: command === 'build' && env.VITE_ERROR_REPORTING_ENABLED === 'true' }
}
