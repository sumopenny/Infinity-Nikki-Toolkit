import { expect, it } from 'vitest'
import { parseSourceUrl } from '../../src/utils/outfit/outfitSourceUrl'

const url = 'https://example.com/a%2fb?q=a+b&x=1&x=2#part%20one'
it('preserves every byte of a pure or embedded link', () => {
  expect(parseSourceUrl(url)).toEqual({ url })
  expect(parseSourceUrl(`这套好看 “${url}” 快来看`)).toEqual({ url })
  expect(parseSourceUrl(`分享 (${url})`)).toEqual({ url })
  expect(parseSourceUrl('https://example.com/a_(b)')).toEqual({ url: 'https://example.com/a_(b)' })
})
it('rejects ambiguity and invalid input, and allows clearing', () => {
  expect(parseSourceUrl(`${url} https://example.org`)).toEqual({ url: '', error: 'multiple' })
  expect(parseSourceUrl('没有网址')).toEqual({ url: '', error: 'invalid' })
  expect(parseSourceUrl('javascript:alert(1)')).toEqual({ url: '', error: 'invalid' })
  expect(parseSourceUrl('   ')).toEqual({ url: '' })
})
