<template>
  <div v-html="renderedContent"></div>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { marked } from 'marked'
import 'highlight.js/styles/atom-one-dark.css'

const renderedContent = ref()

const props = defineProps<{
  content: string
}>()

onMounted(() => {
  marked.setOptions({
    breaks: true,
    gfm: true
  })

  if (props.content) {
    renderContent()
  }
})

const renderContent = () => {
  renderedContent.value = marked(props.content)
}

watch(
  () => props.content,
  (newContent) => {
    if (!newContent) {
      renderedContent.value = ''
      return
    }
    renderContent()
  }
)
</script>

<style>
pre {
  background-color: #282c34;
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  margin: 1em 0;
}

code {
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.9em;
}

.hljs-keyword,
.hljs-selector-tag,
.hljs-title,
.hljs-section,
.hljs-doctag,
.hljs-name,
.hljs-strong {
  font-weight: bold;
}

.hljs-comment {
  color: #7f848e;
}

.hljs-string,
.hljs-attr {
  color: #98c379;
}

.hljs-keyword,
.hljs-type {
  color: #c678dd;
}

.hljs-literal,
.hljs-number {
  color: #d19a66;
}

.hljs-tag,
.hljs-name,
.hljs-attribute {
  color: #e06c75;
}

.hljs-function,
.hljs-subst {
  color: #61afef;
}
</style>
