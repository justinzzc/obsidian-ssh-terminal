## ADDED Requirements

### Requirement: SSH block 支持互斥的 profile 与明文直连模式
系统 SHALL 支持现有 `profile` 引用模式和新的明文直连模式，并 SHALL 根据字段集合把每个 block 解析为唯一模式。`profile` 与任一 `host`、`port`、`username`、`password` 字段同时出现时，系统 MUST 拒绝该 block，且不得定义隐式优先级。

#### Scenario: 现有 profile block 保持兼容
- **WHEN** block 包含非空 `profile` 和可选的有效 `height`
- **THEN** 系统 SHALL 按现有 profile 引用模式解析并连接，且 SHALL 从系统钥匙串读取该 profile 的密码

#### Scenario: profile 与直连字段混用
- **WHEN** block 同时包含 `profile` 和任一直连字段
- **THEN** 系统 SHALL 返回模式冲突错误，不创建终端会话，且错误文本 MUST NOT 包含密码值

### Requirement: 明文直连模式提供严格的连接字段与默认值
明文直连 block MUST 接受非空字符串 `host`、非空字符串 `username`、非空字符串 `password`，并 MAY 接受整数 `port` 与整数 `height`。省略 `port` 时系统 SHALL 使用 `22`；省略 `height` 时系统 SHALL 使用 `360`；SSH 连接超时 SHALL 使用 `15000ms` 的默认值。

#### Scenario: 使用最小直连配置
- **WHEN** block 只提供有效的 `host`、`username` 和 `password`
- **THEN** 系统 SHALL 创建使用端口 `22`、高度 `360` 和超时 `15000ms` 的直连目标

#### Scenario: 使用显式端口与高度
- **WHEN** block 提供有效的 `host`、`username`、`password`、`port` 和 `height`
- **THEN** 系统 SHALL 原样使用连接字段，并使用指定端口与高度

#### Scenario: 保留密码字符串的精确值
- **WHEN** `password` 是非空 YAML 字符串，包括前导空格、尾随空格或特殊字符
- **THEN** 系统 SHALL 不裁剪、不转换并按解析后的精确字符串进行认证

### Requirement: 明文直连字段执行安全且确定的校验
系统 MUST 拒绝缺失的必填字段、非字符串的 `host`/`username`/`password`、范围 `1..65535` 之外或非整数的 `port`、范围 `180..900` 之外或非整数的 `height`、未知字段以及不支持的 `privateKey` 或 `passphrase`。校验错误 SHALL 使用稳定错误码和不含秘密的消息。

#### Scenario: 数字密码未加引号
- **WHEN** YAML 把 `password` 解析为 number、boolean、null 或其他非字符串类型
- **THEN** 系统 SHALL 在任何网络请求前拒绝该 block，并提示密码必须写成 YAML 字符串且必要时加引号

#### Scenario: 直连必填字段缺失
- **WHEN** block 已出现任一直连字段但缺少 `host`、`username` 或 `password`
- **THEN** 系统 SHALL 指出缺失字段，不创建网络客户端，且不得回显其他连接值

#### Scenario: 未知或不支持的秘密字段
- **WHEN** block 包含 schema 未定义的字段、`privateKey` 或 `passphrase`
- **THEN** 系统 SHALL 拒绝该 block，并 SHALL NOT 尝试猜测、忽略或持久化该字段

### Requirement: inline 密码绕过持久化凭据存储并仅供当前会话使用
系统 SHALL 把 inline 密码直接提供给对应渲染实例的 SSH 会话，MUST NOT 调用 `CredentialStore.setPassword`，MUST NOT 把密码写入插件 `data.json` 或主机密钥记录，并 MUST NOT 要求系统钥匙串可用。视图销毁或会话关闭后，系统 SHALL 释放 manager、session、terminal 和 widget 持有的连接目标引用。

#### Scenario: 系统钥匙串不可用时进行 inline 连接
- **WHEN** block 使用有效明文直连模式且系统钥匙串不可用
- **THEN** 系统 SHALL 仍可使用 block 密码发起连接，且 SHALL NOT 降级调用任何持久化凭据接口

#### Scenario: inline 会话结束
- **WHEN** 用户断开连接、关闭文档、编辑 block 导致 widget 重建或禁用插件
- **THEN** 系统 SHALL 幂等关闭 SSH 资源并移除活动会话及其 inline 连接目标引用

### Requirement: 插件输出不得泄露 inline 密码
系统 MUST NOT 在错误消息、状态文本、主机密钥确认内容、Notice、日志、序列化插件数据或测试快照中包含 inline 密码。认证失败与网络失败 SHALL 继续映射为分类后的安全错误。

#### Scenario: inline 认证失败
- **WHEN** 服务器拒绝 block 中的密码
- **THEN** 系统 SHALL 显示通用认证失败错误，且所有用户可见文本和插件持久化数据 MUST NOT 包含该密码

#### Scenario: 连接参数触发异常
- **WHEN** inline 连接在主机校验、超时、网络或 shell 打开阶段失败
- **THEN** 系统 SHALL 映射安全错误，不序列化或插值整个 block、连接目标或密码提供器

### Requirement: inline 连接沿用严格的主机密钥校验
系统 SHALL 为 inline 连接基于规范化 `host + port` 生成稳定且不含用户名或密码的 endpoint 信任标识。首次连接 MUST 显示算法和 SHA256 指纹并等待明确确认；已信任 endpoint 的算法或指纹变化 MUST 阻断连接。用户 MUST 能从设置界面查看并忘记 inline endpoint 的信任记录。

#### Scenario: 首次连接 inline endpoint
- **WHEN** endpoint 没有已保存的主机密钥
- **THEN** 系统 SHALL 在密码认证完成前要求用户核对并确认指纹，确认后才保存 endpoint 信任记录并继续

#### Scenario: 同一 endpoint 的不同用户名
- **WHEN** 两个 inline block 使用相同规范化 host 与 port、不同 username
- **THEN** 系统 SHALL 使用同一服务器主机密钥信任记录，且信任标识 MUST NOT 包含任一密码

#### Scenario: inline endpoint 主机密钥变化
- **WHEN** 已信任 endpoint 返回不同算法或指纹
- **THEN** 系统 SHALL 阻断连接；用户忘记该 endpoint 的记录后，下一次连接 SHALL 重新进入首次确认流程

### Requirement: 阅读视图与实时预览提供一致的 inline 行为
阅读视图和实时预览 SHALL 复用同一解析与连接目标解析逻辑，对相同 block 产生相同的模式、默认值、校验错误和连接行为。每个渲染实例 SHALL 保持独立 PTY，并在实例销毁时关闭其会话。

#### Scenario: 两种视图渲染有效 inline block
- **WHEN** 同一个有效 inline block 分别在阅读视图与实时预览中渲染
- **THEN** 两种视图 SHALL 显示等价的手动连接终端并使用相同连接参数

#### Scenario: 编辑 inline block
- **WHEN** 用户在实时预览中进入 block 编辑密码或连接字段后离开 block
- **THEN** 旧 widget SHALL 释放旧会话与连接目标，新 widget SHALL 使用更新后的完整配置

### Requirement: 用户文档明确披露 Markdown 明文风险
项目文档 SHALL 在 inline 示例附近明确说明密码会作为 Markdown 明文保存，并可能进入 Obsidian Sync、云盘、备份和版本控制历史；文档 SHALL 同时把 profile + 系统钥匙串模式标为需要秘密保护时的替代方案。

#### Scenario: 用户查阅 inline 配置示例
- **WHEN** 用户阅读 README 中的 inline block 用法
- **THEN** 用户 SHALL 在复制示例前后可见明文风险说明、字段要求、YAML 字符串加引号提示和 profile 安全替代方案
