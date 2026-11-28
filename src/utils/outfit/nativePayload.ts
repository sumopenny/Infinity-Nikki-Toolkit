/** Convert native [:id:value] maps, including nested objects/arrays, without changing strings. */
export function parseNativeOutfitPayload(text: string) {
  const stack: string[] = []
  const json = text.replace(/"(?:\\.|[^"\\])*"|\[:|[{}\[\]]|-?\d+\s*:/g, (token) => {
    if (token.startsWith('"')) return token
    if (token === '[:' || token === '[' || token === '{') {
      stack.push(token)
      return token === '[:' ? '{' : token
    }
    if (token === ']' || token === '}') {
      const opening = stack.pop()
      if (token === ']' && (opening === '[' || opening === '[:'))
        return opening === '[:' ? '}' : ']'
      if (token === '}' && opening === '{') return '}'
      throw new SyntaxError('Mismatched native payload brackets')
    }
    return stack[stack.length - 1] === '[:' ? '"' + token.slice(0, -1).trim() + '":' : token
  })
  if (stack.length) throw new SyntaxError('Unclosed native payload brackets')
  return JSON.parse(json)
}
