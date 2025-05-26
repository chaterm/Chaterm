import { describe, it, beforeEach } from 'mocha'
import 'should'
import { Anthropic } from '@anthropic-ai/sdk'
import { AwsBedrockHandler } from '../bedrock'
import { ApiHandlerOptions, BedrockModelId } from '../../../shared/api'

describe('DevOps Command Generation Tests', () => {
  let handler: AwsBedrockHandler
  let options: ApiHandlerOptions
  // let clock: sinon.SinonFakeTimers

  beforeEach(function () {
    // Increase timeout for all tests in this suite
    this.timeout(60000) // 60 seconds timeout

    // Setup default options for AWS Bedrock
    options = {
      // apiModelId: "anthropic.claude-3-sonnet-20240229-v1:0" as BedrockModelId,
      apiModelId: 'amazon.nova-lite-v1:0' as BedrockModelId,
      awsRegion: 'us-east-1'
    }

    handler = new AwsBedrockHandler(options)

    // Don't use fake timers when making real API calls
    // clock = sinon.useFakeTimers()
  })

  describe('Command Generation', () => {
    it('should generate command to check processes running on port 8000', async function () {
      this.timeout(60000) // Increased timeout for actual API call

      // Use the actual LLM service instead of mocking
      const systemPrompt =
        'You are a DevOps assistant. Provide command-line solutions for system administration tasks. Generate the command only.'
      const messages: Anthropic.Messages.MessageParam[] = [
        {
          role: 'user',
          content: 'check processes running on port 8000'
        }
      ]

      const result: string[] = []

      // Collect the results from the actual LLM
      for await (const chunk of handler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        }
      }

      // Verify the results contain expected command patterns
      const fullResponse = result.join('')
      // We're checking for patterns rather than exact matches since LLM responses may vary
      fullResponse.should.match(/lsof -i.+8000|netstat.+8000|ss.+8000|fuser.+8000/)
    })

    it('should generate command to find large files in a directory', async function () {
      this.timeout(30000) // Increased timeout for actual API call

      // Use the actual LLM service instead of mocking
      const systemPrompt =
        'You are a DevOps assistant. Provide command-line solutions for system administration tasks.'
      const messages: Anthropic.Messages.MessageParam[] = [
        {
          role: 'user',
          content: 'find large files in a directory'
        }
      ]

      const result: string[] = []

      // Collect the results from the actual LLM
      for await (const chunk of handler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        }
      }

      // Verify the results contain expected command patterns
      const fullResponse = result.join('')
      // We're checking for patterns rather than exact matches since LLM responses may vary
      fullResponse.should.match(/find.+size|du.+sort|ls.+-S/)
    })

    it('should generate command to monitor CPU and memory usage', async function () {
      this.timeout(30000) // Increased timeout for actual API call

      // Use the actual LLM service instead of mocking
      const systemPrompt =
        'You are a DevOps assistant. Provide command-line solutions for system administration tasks.'
      const messages: Anthropic.Messages.MessageParam[] = [
        {
          role: 'user',
          content: 'monitor CPU and memory usage'
        }
      ]

      const result: string[] = []

      // Collect the results from the actual LLM
      for await (const chunk of handler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        }
      }

      // Verify the results contain expected command patterns
      const fullResponse = result.join('')
      // We're checking for patterns rather than exact matches since LLM responses may vary
      fullResponse.should.match(/top|htop|free|vmstat|mpstat|ps/)
    })

    it('should generate command to check disk usage', async function () {
      this.timeout(30000) // Increased timeout for actual API call

      // Use the actual LLM service instead of mocking
      const systemPrompt =
        'You are a DevOps assistant. Provide command-line solutions for system administration tasks.'
      const messages: Anthropic.Messages.MessageParam[] = [
        {
          role: 'user',
          content: 'check disk usage'
        }
      ]

      const result: string[] = []

      // Collect the results from the actual LLM
      for await (const chunk of handler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        }
      }

      // Verify the results contain expected command patterns
      const fullResponse = result.join('')
      // We're checking for patterns rather than exact matches since LLM responses may vary
      fullResponse.should.match(/df -h|du -[sh]/)
    })

    it('should generate command to find and kill a process by name', async function () {
      this.timeout(30000) // Increased timeout for actual API call

      // Use the actual LLM service instead of mocking
      const systemPrompt =
        'You are a DevOps assistant. Provide command-line solutions for system administration tasks.'
      const messages: Anthropic.Messages.MessageParam[] = [
        {
          role: 'user',
          content: 'find and kill a process by name'
        }
      ]

      const result: string[] = []

      // Collect the results from the actual LLM
      for await (const chunk of handler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        }
      }

      // Verify the results contain expected command patterns
      const fullResponse = result.join('')
      // We're checking for patterns rather than exact matches since LLM responses may vary
      fullResponse.should.match(/kill|pkill|killall|pgrep|ps.+grep/)
    })
  })
})
