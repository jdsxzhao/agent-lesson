# Agent Lesson

一个用于从头实现终端 Agent 的最小 TypeScript + ESM 项目环境。

## 开始使用

```bash
npm install
npm start
```

输入 `foo` 可以体验唯一的示例响应；输入 `exit` 或 `quit` 退出会话。

开发时可以跳过编译，直接运行 TypeScript：

```bash
npm run dev
```

## 使用 `yl` 命令

在项目目录执行一次：

```bash
npm link
```

之后即可在终端任意目录执行 `yl` 进入会话。运行 `npm unlink -g agent-lesson`
可以移除这个全局链接。

## 实现自己的 Agent

- `src/agent.ts`：Agent 接口和 `foo` 示例；从这里接入模型、工具与记忆。
- `src/session.ts`：终端输入输出循环。
- `src/cli.ts`：`yl` 命令入口。

## 项目命令

```bash
npm run build
npm test
npm start
npm run dev
```
