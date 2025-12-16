import { describe, it, expect } from 'vitest'
import { parseJumpserverOutput, parseJumpServerUsers, hasUserSelectionPrompt } from '../parser'

describe('JumpServer Parser', () => {
  describe('parseJumpserverOutput', () => {
    describe('中文格式解析', () => {
      const chineseOutput = `
  ID | 名称                             | 地址        | 平台           | 组织            | 备注                          
-----+----------------------------------+-------------+----------------+-----------------+-------------------------------
  1  | centos_CcCsync_d3335             | 10.0.0.194  | Linux          | Default         | 由CMDB创建                    
  2  | centos_SalesforceDbproxy_d3368   | 10.0.0.254  | Linux          | Default         | 由CMDB创建                    
  3  | centos_AutomNlog_d3297           | 10.0.2.202  | Linux          | Default         |                               
  4  | centos_AutomNgx_1024             | 10.2.1.24   | Linux          | Default         |                               
  5  | centos-CcbEsZdaoUserRedis-11029  | 10.2.11.29  | Linux          | Default         |                               
页码：1，每页行数：15，总页数：6，总数量：88
提示：输入资产ID直接登录，二级搜索使用 // + 字段，如：//192 上一页：b 下一页：n
搜索：
`

      it('应该正确解析中文表头的资产列表', () => {
        const result = parseJumpserverOutput(chineseOutput)

        expect(result.assets).toHaveLength(5)
        expect(result.assets[0]).toEqual({
          id: 1,
          name: 'centos_CcCsync_d3335',
          address: '10.0.0.194',
          platform: 'Linux',
          organization: 'Default',
          comment: '由CMDB创建'
        })
        expect(result.assets[2]).toEqual({
          id: 3,
          name: 'centos_AutomNlog_d3297',
          address: '10.0.2.202',
          platform: 'Linux',
          organization: 'Default',
          comment: ''
        })
      })

      it('应该正确解析中文分页信息', () => {
        const result = parseJumpserverOutput(chineseOutput)

        expect(result.pagination).toEqual({
          currentPage: 1,
          totalPages: 6
        })
      })
    })

    describe('英文格式解析', () => {
      const englishOutput = `
  ID | NAME                             | ADDRESS     | PLATFORM       | ORGANIZATION       | COMMENT                    
-----+----------------------------------+-------------+----------------+--------------------+----------------------------
  1  | centos_CcCsync_d3335             | 10.0.0.194  | Linux          | Default            | 由CMDB创建                 
  2  | centos_SalesforceDbproxy_d3368   | 10.0.0.254  | Linux          | Default            | 由CMDB创建                 
  3  | centos_AutomNlog_d3297           | 10.0.2.202  | Linux          | Default            |                            
  4  | centos_AutomNgx_1024             | 10.2.1.24   | Linux          | Default            |                            
  5  | centos-CcbEsZdaoUserRedis-11029  | 10.2.11.29  | Linux          | Default            |                            
  6  | SsgDFRedis03-20137               | 10.2.20.137 | Linux          | Default            | 由Cloud平台创建            
Page: 1, Count: 15, Total Page: 6, Total Count: 88
Enter ID number directly login, multiple search use // + field, such as: //16 Page up: b        Page down: n
Search: 
`

      it('应该正确解析英文表头的资产列表', () => {
        const result = parseJumpserverOutput(englishOutput)

        expect(result.assets).toHaveLength(6)
        expect(result.assets[0]).toEqual({
          id: 1,
          name: 'centos_CcCsync_d3335',
          address: '10.0.0.194',
          platform: 'Linux',
          organization: 'Default',
          comment: '由CMDB创建'
        })
        expect(result.assets[5]).toEqual({
          id: 6,
          name: 'SsgDFRedis03-20137',
          address: '10.2.20.137',
          platform: 'Linux',
          organization: 'Default',
          comment: '由Cloud平台创建'
        })
      })

      it('应该正确解析英文分页信息', () => {
        const result = parseJumpserverOutput(englishOutput)

        expect(result.pagination).toEqual({
          currentPage: 1,
          totalPages: 6
        })
      })
    })

    describe('边界情况', () => {
      it('空输出应该返回空资产列表和默认分页', () => {
        const result = parseJumpserverOutput('')

        expect(result.assets).toEqual([])
        expect(result.pagination).toEqual({
          currentPage: 1,
          totalPages: 1
        })
      })

      it('无表头内容应该返回空资产列表', () => {
        const noHeaderOutput = `
Some random text
Another line without table format
`
        const result = parseJumpserverOutput(noHeaderOutput)

        expect(result.assets).toEqual([])
      })

      it('仅有分隔符应该返回空资产列表', () => {
        const separatorOnlyOutput = `-----+----------------------------------+-------------+----------------+-----------------+-------------------------------`
        const result = parseJumpserverOutput(separatorOnlyOutput)

        expect(result.assets).toEqual([])
      })
    })
  })

  describe('parseJumpServerUsers', () => {
    const userSelectionOutput = `
  ID | NAME          | USERNAME     
-----+---------------+--------------
  1  | admin         | admin        
  2  | developer     | dev_user     
  3  | operator      | ops_user     
Tips: Input account ID to confirm
Back: b
ID> 
`

    it('应该正确解析用户列表', () => {
      const users = parseJumpServerUsers(userSelectionOutput)

      expect(users).toHaveLength(3)
      expect(users[0]).toEqual({
        id: 1,
        name: 'admin',
        username: 'admin'
      })
      expect(users[1]).toEqual({
        id: 2,
        name: 'developer',
        username: 'dev_user'
      })
      expect(users[2]).toEqual({
        id: 3,
        name: 'operator',
        username: 'ops_user'
      })
    })

    it('遇到 Tips 时应该停止解析', () => {
      const outputWithTips = `
  ID | NAME          | USERNAME     
-----+---------------+--------------
  1  | admin         | admin        
Tips: Some tips here
  2  | should_not_appear | hidden   
`
      const users = parseJumpServerUsers(outputWithTips)

      expect(users).toHaveLength(1)
      expect(users[0].name).toBe('admin')
    })

    it('遇到 Back: 时应该停止解析', () => {
      const outputWithBack = `
  ID | NAME          | USERNAME     
-----+---------------+--------------
  1  | admin         | admin        
Back: b
  2  | should_not_appear | hidden   
`
      const users = parseJumpServerUsers(outputWithBack)

      expect(users).toHaveLength(1)
    })

    it('遇到 ID> 提示符时应该停止解析', () => {
      const outputWithIdPrompt = `
  ID | NAME          | USERNAME     
-----+---------------+--------------
  1  | admin         | admin        
ID> 
  2  | should_not_appear | hidden   
`
      const users = parseJumpServerUsers(outputWithIdPrompt)

      expect(users).toHaveLength(1)
    })

    it('空输出应该返回空用户列表', () => {
      const users = parseJumpServerUsers('')

      expect(users).toEqual([])
    })

    it('无表头输出应该返回空用户列表', () => {
      const noHeaderOutput = 'Some random text without user table'
      const users = parseJumpServerUsers(noHeaderOutput)

      expect(users).toEqual([])
    })

    it('应该跳过分隔符行', () => {
      const outputWithSeparator = `
  ID | NAME          | USERNAME     
---+---+---
  1  | admin         | admin        
`
      const users = parseJumpServerUsers(outputWithSeparator)

      expect(users).toHaveLength(1)
      expect(users[0].name).toBe('admin')
    })
  })

  describe('hasUserSelectionPrompt', () => {
    it('应该检测包含用户选择提示的输出', () => {
      const promptOutput = `
Please select account ID to connect:
  ID | NAME          | USERNAME     
-----+---------------+--------------
  1  | admin         | admin        
`
      expect(hasUserSelectionPrompt(promptOutput)).toBe(true)
    })

    it('应该检测完整格式的用户选择提示', () => {
      const fullPromptOutput = `
Select account ID to login:
  ID | NAME          | USERNAME     
-----+---------------+--------------
  1  | admin         | admin        
  2  | developer     | dev_user     
`
      expect(hasUserSelectionPrompt(fullPromptOutput)).toBe(true)
    })

    it('不包含 account ID 时应该返回 false', () => {
      const noAccountIdOutput = `
  ID | NAME          | USERNAME     
-----+---------------+--------------
  1  | admin         | admin        
`
      expect(hasUserSelectionPrompt(noAccountIdOutput)).toBe(false)
    })

    it('不包含表头时应该返回 false', () => {
      const noHeaderOutput = `
Please select account ID to connect:
Some other content
`
      expect(hasUserSelectionPrompt(noHeaderOutput)).toBe(false)
    })

    it('空输出应该返回 false', () => {
      expect(hasUserSelectionPrompt('')).toBe(false)
    })

    it('只包含部分关键字时应该返回 false', () => {
      // 只有 account ID，没有表头
      expect(hasUserSelectionPrompt('account ID')).toBe(false)
      // 只有 ID 和 NAME，没有 account ID
      expect(hasUserSelectionPrompt('ID | NAME')).toBe(false)
    })
  })
})
