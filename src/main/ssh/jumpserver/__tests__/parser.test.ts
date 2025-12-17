import { describe, it, expect } from 'vitest'
import { parseJumpserverOutput, parseJumpServerUsers, hasUserSelectionPrompt } from '../parser'

describe('JumpServer Parser', () => {
  describe('parseJumpserverOutput', () => {
    describe('中文格式解析', () => {
      const chineseOutput = `
  ID | 名称                             | 地址        | 平台           | 组织            | 备注                          
-----+----------------------------------+-------------+----------------+-----------------+-------------------------------
  1  | demo-app-01                      | 192.0.2.10   | Linux          | ExampleOrg      | 示例资产A                     
  2  | demo-db-01                       | 198.51.100.20| Linux          | ExampleOrg      | 数据库节点                    
  3  | demo-cache-01                    | 203.0.113.30 | Linux          | ExampleOrg      |                               
  4  | qa-proxy-01                      | 192.0.2.40   | Linux          | ExampleOrg      | 代理                          
  5  | ops-bastion-01                   | 198.51.100.50| Linux          | ExampleOrg      | 跳板                          
页码：1，每页行数：15，总页数：6，总数量：88
提示：输入资产ID直接登录，二级搜索使用 // + 字段，如：//192 上一页：b 下一页：n
搜索：
`

      it('应该正确解析中文表头的资产列表', () => {
        const result = parseJumpserverOutput(chineseOutput)

        expect(result.assets).toHaveLength(5)
        expect(result.assets[0]).toEqual({
          id: 1,
          name: 'demo-app-01',
          address: '192.0.2.10',
          platform: 'Linux',
          organization: 'ExampleOrg',
          comment: '示例资产A'
        })
        expect(result.assets[2]).toEqual({
          id: 3,
          name: 'demo-cache-01',
          address: '203.0.113.30',
          platform: 'Linux',
          organization: 'ExampleOrg',
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
  1  | demo-app-01                      | 192.0.2.10   | Linux          | ExampleOrg      | sample asset A                
  2  | demo-db-01                       | 198.51.100.20| Linux          | ExampleOrg      | database node                 
  3  | demo-cache-01                    | 203.0.113.30 | Linux          | ExampleOrg      | cache layer                   
  4  | qa-proxy-01                      | 192.0.2.40   | Linux          | ExampleOrg      | proxy                         
  5  | ops-bastion-01                   | 198.51.100.50| Linux          | ExampleOrg      | bastion host                  
  6  | staging-worker-02                | 203.0.113.60 | Linux          | ExampleOrg      | autoscale node                
Page: 1, Count: 15, Total Page: 6, Total Count: 88
Enter ID number directly login, multiple search use // + field, such as: //16 Page up: b        Page down: n
Search: 
`

      it('应该正确解析英文表头的资产列表', () => {
        const result = parseJumpserverOutput(englishOutput)

        expect(result.assets).toHaveLength(6)
        expect(result.assets[0]).toEqual({
          id: 1,
          name: 'demo-app-01',
          address: '192.0.2.10',
          platform: 'Linux',
          organization: 'ExampleOrg',
          comment: 'sample asset A'
        })
        expect(result.assets[5]).toEqual({
          id: 6,
          name: 'staging-worker-02',
          address: '203.0.113.60',
          platform: 'Linux',
          organization: 'ExampleOrg',
          comment: 'autoscale node'
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
