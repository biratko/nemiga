<script setup lang="ts">
import { computed } from 'vue'
import type { FSEntry } from '@/types/fs'
import { resolveIconName } from '@/utils/iconMap'

import folderSvg from '@/assets/icons/folder.svg?raw'
import fileSvg from '@/assets/icons/file.svg?raw'
import symlinkSvg from '@/assets/icons/symlink.svg?raw'
import archiveSvg from '@/assets/icons/archive.svg?raw'
import typescriptSvg from '@/assets/icons/typescript.svg?raw'
import javascriptSvg from '@/assets/icons/javascript.svg?raw'
import vueSvg from '@/assets/icons/vue.svg?raw'
import jsonSvg from '@/assets/icons/json.svg?raw'
import markdownSvg from '@/assets/icons/markdown.svg?raw'
import htmlSvg from '@/assets/icons/html.svg?raw'
import cssSvg from '@/assets/icons/css.svg?raw'
import scssSvg from '@/assets/icons/scss.svg?raw'
import lessSvg from '@/assets/icons/less.svg?raw'
import imageSvg from '@/assets/icons/image.svg?raw'
import svgSvg from '@/assets/icons/svg.svg?raw'
import yamlSvg from '@/assets/icons/yaml.svg?raw'
import shellSvg from '@/assets/icons/shell.svg?raw'
import pythonSvg from '@/assets/icons/python.svg?raw'
import goSvg from '@/assets/icons/go.svg?raw'
import rustSvg from '@/assets/icons/rust.svg?raw'
import textSvg from '@/assets/icons/text.svg?raw'
import lockSvg from '@/assets/icons/lock.svg?raw'
import tomlSvg from '@/assets/icons/toml.svg?raw'
import xmlSvg from '@/assets/icons/xml.svg?raw'
import tsxSvg from '@/assets/icons/tsx.svg?raw'
import jsxSvg from '@/assets/icons/jsx.svg?raw'
import sqlSvg from '@/assets/icons/sql.svg?raw'
import graphqlSvg from '@/assets/icons/graphql.svg?raw'
import protoSvg from '@/assets/icons/proto.svg?raw'
import javaSvg from '@/assets/icons/java.svg?raw'
import rubySvg from '@/assets/icons/ruby.svg?raw'
import phpSvg from '@/assets/icons/php.svg?raw'
import cSvg from '@/assets/icons/c.svg?raw'
import cppSvg from '@/assets/icons/cpp.svg?raw'
import hSvg from '@/assets/icons/h.svg?raw'
import swiftSvg from '@/assets/icons/swift.svg?raw'
import kotlinSvg from '@/assets/icons/kotlin.svg?raw'
import luaSvg from '@/assets/icons/lua.svg?raw'
import zigSvg from '@/assets/icons/zig.svg?raw'
import pdfSvg from '@/assets/icons/pdf.svg?raw'
import audioSvg from '@/assets/icons/audio.svg?raw'
import videoSvg from '@/assets/icons/video.svg?raw'
import envSvg from '@/assets/icons/env.svg?raw'
import dockerSvg from '@/assets/icons/docker.svg?raw'
import makefileSvg from '@/assets/icons/makefile.svg?raw'
import gitSvg from '@/assets/icons/git.svg?raw'
import certificateSvg from '@/assets/icons/certificate.svg?raw'
import readmeSvg from '@/assets/icons/readme.svg?raw'
import npmSvg from '@/assets/icons/npm.svg?raw'
import viteSvg from '@/assets/icons/vite.svg?raw'
import eslintSvg from '@/assets/icons/eslint.svg?raw'
import prettierSvg from '@/assets/icons/prettier.svg?raw'
import tsconfigSvg from '@/assets/icons/tsconfig.svg?raw'

const SVG_MAP: Record<string, string> = {
  folder: folderSvg,
  file: fileSvg,
  symlink: symlinkSvg,
  archive: archiveSvg,
  typescript: typescriptSvg,
  javascript: javascriptSvg,
  vue: vueSvg,
  json: jsonSvg,
  markdown: markdownSvg,
  html: htmlSvg,
  css: cssSvg,
  scss: scssSvg,
  less: lessSvg,
  image: imageSvg,
  svg: svgSvg,
  yaml: yamlSvg,
  shell: shellSvg,
  python: pythonSvg,
  go: goSvg,
  rust: rustSvg,
  text: textSvg,
  lock: lockSvg,
  toml: tomlSvg,
  xml: xmlSvg,
  tsx: tsxSvg,
  jsx: jsxSvg,
  sql: sqlSvg,
  graphql: graphqlSvg,
  proto: protoSvg,
  java: javaSvg,
  ruby: rubySvg,
  php: phpSvg,
  c: cSvg,
  cpp: cppSvg,
  h: hSvg,
  swift: swiftSvg,
  kotlin: kotlinSvg,
  lua: luaSvg,
  zig: zigSvg,
  pdf: pdfSvg,
  audio: audioSvg,
  video: videoSvg,
  env: envSvg,
  docker: dockerSvg,
  makefile: makefileSvg,
  git: gitSvg,
  certificate: certificateSvg,
  readme: readmeSvg,
  npm: npmSvg,
  vite: viteSvg,
  eslint: eslintSvg,
  prettier: prettierSvg,
  tsconfig: tsconfigSvg,
}

const props = defineProps<{ entry: FSEntry }>()

const svgContent = computed(() => {
  const iconName = resolveIconName(props.entry)
  return SVG_MAP[iconName] ?? SVG_MAP.file
})
</script>

<template>
  <span class="file-icon" v-html="svgContent" />
</template>

<style scoped>
.file-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.file-icon :deep(svg) {
  width: 14px;
  height: 14px;
}
</style>
