// Exercise the retained features in their enabled state. Pause behavior has a separate suite.
import { vi } from 'vitest'

vi.mock('../../src/communityResources', async (original) => ({
  ...(await original<typeof import('../../src/communityResources')>()),
  communityResourcesPaused: false
}))
