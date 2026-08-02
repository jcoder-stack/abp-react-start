#!/usr/bin/env node
import { main } from "../dist/index.js";

// process.exit 会连同尚未 flush 的 stdout 一起砍掉，而 init 成功路径要打近百行接线指引，
// 管道/重定向下正是丢输出的场景。设 exitCode 让事件循环自然跑完。
process.exitCode = await main(process.argv.slice(2));
