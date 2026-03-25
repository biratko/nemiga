export function joinPath(basePath: string, name: string): string {
  return basePath === '/' ? '/' + name : basePath + '/' + name
}
