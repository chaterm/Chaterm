import { describe, it, beforeEach, afterEach } from 'mocha'
import 'should'
import * as sinon from 'sinon'
import { Anthropic } from '@anthropic-ai/sdk'
import AnthropicBedrock from '@anthropic-ai/bedrock-sdk'
import { AwsBedrockHandler } from '../bedrock'
import { ApiHandlerOptions, BedrockModelId } from '../../../shared/api'
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime'

describe('AwsBedrockHandler', () => {
  let handler: AwsBedrockHandler
  let options: ApiHandlerOptions
  let clock: sinon.SinonFakeTimers
  let anthropicBedrockStub: sinon.SinonStubbedInstance<AnthropicBedrock>
  let bedrockClientStub: sinon.SinonStubbedInstance<BedrockRuntimeClient>

  beforeEach(() => {
    // Setup default options for AWS Bedrock
    options = {
      apiModelId: 'anthropic.claude-3-sonnet-20240229-v1:0' as BedrockModelId,
      awsRegion: 'us-east-1'
      // awsAccessKey: "test-access-key",
      // awsSecretKey: "test-secret-key",
      // awsSessionToken: "test-session-token"
    }

    handler = new AwsBedrockHandler(options)

    // Create stubs for the AWS clients
    anthropicBedrockStub = sinon.createStubInstance(AnthropicBedrock)
    bedrockClientStub = sinon.createStubInstance(BedrockRuntimeClient)

    // Use fake timers for testing timeouts
    clock = sinon.useFakeTimers()
  })

  afterEach(() => {
    clock.restore()
    sinon.restore()
  })

  describe('getModelId', () => {
    it('should return the correct model ID', async function () {
      const modelId = await handler.getModelId()
      modelId.should.equal('anthropic.claude-3-sonnet-20240229-v1:0')
    })

    it('should prefix model ID with region when cross-region inference is enabled', async function () {
      // Create handler with cross-region inference enabled
      const crossRegionOptions = {
        ...options,
        awsUseCrossRegionInference: true
      }
      const crossRegionHandler = new AwsBedrockHandler(crossRegionOptions)

      const modelId = await crossRegionHandler.getModelId()
      modelId.should.equal('us.anthropic.claude-3-sonnet-20240229-v1:0')
    })
  })

  describe('getModel', () => {
    it('should return the correct model info', function () {
      const model = handler.getModel()
      model.id.should.equal('anthropic.claude-3-sonnet-20240229-v1:0')
      model.should.have.property('info')
    })

    it('should return default model when invalid model ID is provided', function () {
      const invalidOptions = {
        ...options,
        apiModelId: 'invalid-model-id' as BedrockModelId
      }
      const invalidHandler = new AwsBedrockHandler(invalidOptions)

      const model = invalidHandler.getModel()
      model.should.have.property('id')
      model.should.have.property('info')
    })
  })

  describe('createMessage', () => {
    it('should call Anthropic Bedrock client with correct parameters', async function () {
      this.timeout(5000)

      // Create a mock for the AnthropicBedrock client
      const mockMessages = {
        create: sinon.stub().resolves({
          [Symbol.asyncIterator]: async function* () {
            // Simulate message_start event
            yield {
              type: 'message_start',
              message: {
                id: 'msg_123',
                usage: {
                  input_tokens: 50,
                  output_tokens: 0
                }
              }
            }

            // Simulate content_block_start event
            yield {
              type: 'content_block_start',
              index: 0,
              content_block: {
                type: 'text',
                text: "Hello, I'm Claude!"
              }
            }

            // Simulate content_block_delta event
            yield {
              type: 'content_block_delta',
              index: 0,
              delta: {
                type: 'text_delta',
                text: ' How can I help you today?'
              }
            }

            // Simulate message_delta event with token usage
            yield {
              type: 'message_delta',
              usage: {
                output_tokens: 10
              }
            }
          }
        })
      }

      // Setup the stub to return our mock
      anthropicBedrockStub.messages = mockMessages as any

      // Replace the getAnthropicClient method to return our stub
      sinon.stub(handler as any, 'getAnthropicClient').resolves(anthropicBedrockStub)

      const systemPrompt = 'You are a helpful assistant.'
      const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: 'Hello' }]

      const result: string[] = []
      const usageInfo: any[] = []

      // Collect the results
      for await (const chunk of handler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        } else if (chunk.type === 'usage') {
          usageInfo.push({
            inputTokens: chunk.inputTokens,
            outputTokens: chunk.outputTokens,
            cacheWriteTokens: chunk.cacheWriteTokens,
            cacheReadTokens: chunk.cacheReadTokens
          })
        }
      }

      // Verify the results
      result.should.deepEqual(["Hello, I'm Claude!", ' How can I help you today?'])
      usageInfo.should.have.length(2)
      usageInfo[0].should.have.property('inputTokens', 50)
      mockMessages.create.calledOnce.should.be.true()

      // Verify the parameters passed to the create method
      const createArgs = mockMessages.create.firstCall.args[0]
      createArgs.should.have.property('model')
      createArgs.should.have.property('system')
      createArgs.should.have.property('messages')
      createArgs.system[0].should.have.property('text', systemPrompt)
    })

    it('should handle Nova models correctly', async function () {
      this.timeout(5000)

      // Setup options for Nova model
      const novaOptions = {
        ...options,
        apiModelId: 'amazon.nova-lite-v1:0' as BedrockModelId
      }
      const novaHandler = new AwsBedrockHandler(novaOptions)

      // Create a mock for the BedrockRuntimeClient
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          // Simulate metadata with token usage
          yield {
            metadata: {
              usage: {
                inputTokens: 30,
                outputTokens: 15
              }
            }
          }

          // Simulate content delta
          yield {
            contentBlockDelta: {
              delta: {
                text: 'Hello from Nova!'
              }
            }
          }

          // Simulate reasoning content
          yield {
            contentBlockDelta: {
              delta: {
                reasoningContent: {
                  text: 'This is reasoning content'
                }
              }
            }
          }
        }
      }

      // Setup the stub to return our mock
      bedrockClientStub.send.resolves({ stream: mockStream } as any)

      // Replace the getBedrockClient method to return our stub
      sinon.stub(novaHandler as any, 'getBedrockClient').resolves(bedrockClientStub)

      const systemPrompt = 'You are a helpful assistant.'
      const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: 'Hello' }]

      const result: string[] = []
      const reasoning: string[] = []
      const usageInfo: any[] = []

      // Collect the results
      for await (const chunk of novaHandler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        } else if (chunk.type === 'reasoning') {
          reasoning.push(chunk.reasoning)
        } else if (chunk.type === 'usage') {
          usageInfo.push({
            inputTokens: chunk.inputTokens,
            outputTokens: chunk.outputTokens
          })
        }
      }

      // Verify the results
      result.should.deepEqual(['Hello from Nova!'])
      reasoning.should.deepEqual(['This is reasoning content'])
      usageInfo.should.have.length(1)
      usageInfo[0].should.have.property('inputTokens', 30)
      usageInfo[0].should.have.property('outputTokens', 15)
      bedrockClientStub.send.calledOnce.should.be.true()
    })

    it('should handle Deepseek models correctly', async function () {
      this.timeout(5000)

      // Setup options for Deepseek model
      const deepseekOptions = {
        ...options,
        apiModelId: 'deepseek.r1-v1:0' as BedrockModelId
      }
      const deepseekHandler = new AwsBedrockHandler(deepseekOptions)

      // Create a mock for the BedrockRuntimeClient
      const mockBody = {
        [Symbol.asyncIterator]: async function* () {
          // Simulate response chunks
          yield {
            chunk: {
              bytes: Buffer.from(
                JSON.stringify({
                  choices: [
                    {
                      text: 'Hello from Deepseek!'
                    }
                  ]
                })
              )
            }
          }

          yield {
            chunk: {
              bytes: Buffer.from(
                JSON.stringify({
                  delta: {
                    text: ' How can I assist you?'
                  }
                })
              )
            }
          }
        }
      }

      // Setup the stub to return our mock
      bedrockClientStub.send.resolves({ body: mockBody } as any)

      // Replace the getBedrockClient method to return our stub
      sinon.stub(deepseekHandler as any, 'getBedrockClient').resolves(bedrockClientStub)

      const systemPrompt = 'You are a helpful assistant.'
      const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: 'Hello' }]

      const result: string[] = []
      const usageInfo: any[] = []

      // Collect the results
      for await (const chunk of deepseekHandler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        } else if (chunk.type === 'usage') {
          usageInfo.push({
            inputTokens: chunk.inputTokens,
            outputTokens: chunk.outputTokens
          })
        }
      }

      // Verify the results
      result.should.deepEqual(['Hello from Deepseek!', ' How can I assist you?'])
      usageInfo.length.should.be.greaterThan(0)
      bedrockClientStub.send.calledOnce.should.be.true()
    })

    it('should handle errors and retry', async function () {
      this.timeout(10000)
      // Restore real timers for this test
      clock.restore()

      // Create a mock for the AnthropicBedrock client
      const mockMessages = {
        create: sinon.stub()
      }

      // First call throws an error with status code 429 (rate limit) to trigger retry
      const apiError = new Error('API Error')
      ;(apiError as any).status = 429
      ;(apiError as any).headers = { 'retry-after': '1' } // 1 second retry
      mockMessages.create.onFirstCall().rejects(apiError)

      // Second call succeeds
      mockMessages.create.onSecondCall().resolves({
        [Symbol.asyncIterator]: async function* () {
          yield {
            type: 'message_start',
            message: {
              id: 'msg_123',
              usage: {
                input_tokens: 50,
                output_tokens: 0
              }
            }
          }

          yield {
            type: 'content_block_start',
            index: 0,
            content_block: {
              type: 'text',
              text: 'Success after retry'
            }
          }
        }
      })

      // Setup the stub to return our mock
      anthropicBedrockStub.messages = mockMessages as any

      // Replace the getAnthropicClient method to return our stub
      sinon.stub(handler as any, 'getAnthropicClient').resolves(anthropicBedrockStub)

      const systemPrompt = 'You are a helpful assistant.'
      const messages: Anthropic.Messages.MessageParam[] = [{ role: 'user', content: 'Hello' }]

      const result: string[] = []

      // Collect the results
      for await (const chunk of handler.createMessage(systemPrompt, messages)) {
        if (chunk.type === 'text') {
          result.push(chunk.text)
        }
      }

      // Verify the results
      result.should.deepEqual(['Success after retry'])
      mockMessages.create.calledTwice.should.be.true()

      // Restore the fake timers for other tests
      clock = sinon.useFakeTimers()
    })
  })
})
