import type { FSEntry } from '@/types/fs'

const FILENAME_MAP = new Map<string, string>([
  ['Dockerfile', 'docker'],
  ['dockerfile', 'docker'],
  ['Makefile', 'makefile'],
  ['makefile', 'makefile'],
  ['.gitignore', 'git'],
  ['.gitattributes', 'git'],
  ['LICENSE', 'certificate'],
  ['README.md', 'readme'],
  ['README', 'readme'],
  ['package.json', 'npm'],
  ['tsconfig.json', 'tsconfig'],
])

const FILENAME_PATTERNS: { pattern: RegExp; icon: string }[] = [
  { pattern: /^\.env(\..+)?$/, icon: 'env' },
  { pattern: /^tsconfig(\..+)?\.json$/, icon: 'tsconfig' },
  { pattern: /^vite\.config\..+$/, icon: 'vite' },
  { pattern: /^docker-compose\..+$/, icon: 'docker' },
  { pattern: /^\.eslintrc\..+$/, icon: 'eslint' },
  { pattern: /^eslint\.config\..+$/, icon: 'eslint' },
  { pattern: /^\.prettierrc(\..+)?$/, icon: 'prettier' },
  { pattern: /^LICENSE\..+$/, icon: 'certificate' },
]

const EXTENSION_MAP = new Map<string, string>([
  ['ts', 'typescript'],
  ['js', 'javascript'],
  ['vue', 'vue'],
  ['json', 'json'],
  ['md', 'markdown'],
  ['html', 'html'],
  ['css', 'css'],
  ['scss', 'scss'],
  ['less', 'less'],
  ['png', 'image'],
  ['jpg', 'image'],
  ['jpeg', 'image'],
  ['gif', 'image'],
  ['svg', 'svg'],
  ['yml', 'yaml'],
  ['yaml', 'yaml'],
  ['sh', 'shell'],
  ['bash', 'shell'],
  ['zsh', 'shell'],
  ['py', 'python'],
  ['go', 'go'],
  ['rs', 'rust'],
  ['txt', 'text'],
  ['lock', 'lock'],
  ['toml', 'toml'],
  ['xml', 'xml'],
  ['tsx', 'tsx'],
  ['jsx', 'jsx'],
  ['sql', 'sql'],
  ['graphql', 'graphql'],
  ['gql', 'graphql'],
  ['proto', 'proto'],
  ['java', 'java'],
  ['rb', 'ruby'],
  ['php', 'php'],
  ['c', 'c'],
  ['cpp', 'cpp'],
  ['cc', 'cpp'],
  ['cxx', 'cpp'],
  ['h', 'h'],
  ['hpp', 'h'],
  ['swift', 'swift'],
  ['kt', 'kotlin'],
  ['kts', 'kotlin'],
  ['lua', 'lua'],
  ['zig', 'zig'],
  ['pdf', 'pdf'],
  ['mp3', 'audio'],
  ['wav', 'audio'],
  ['flac', 'audio'],
  ['ogg', 'audio'],
  ['mp4', 'video'],
  ['avi', 'video'],
  ['mkv', 'video'],
  ['mov', 'video'],
  ['env', 'env'],
])

export function resolveIconName(entry: FSEntry): string {
  // 1. Exact filename
  const byName = FILENAME_MAP.get(entry.name)
  if (byName) return byName

  // 2. Pattern filename
  for (const { pattern, icon } of FILENAME_PATTERNS) {
    if (pattern.test(entry.name)) return icon
  }

  // 3. Extension
  if (entry.extension) {
    const byExt = EXTENSION_MAP.get(entry.extension)
    if (byExt) return byExt
  }

  // 4. Fallback by type
  if (entry.type === 'directory') return 'folder'
  if (entry.type === 'symlink') return 'symlink'
  if (entry.isArchive) return 'archive'
  return 'file'
}
