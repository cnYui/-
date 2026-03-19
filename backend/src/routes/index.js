import { Router } from 'express'
import travelRouter from './travel.js'
import diariesRouter from './diaries.js'
import secondmeRouter from './secondme.js'
import memoriesRouter from './memories.js'
import usersRouter from './users.js'
import sparksRouter from './sparks.js'
import postsRouter from './posts.js'
import mailsRouter from './mails.js'
import chatroomsRouter from './chatrooms.js'
import uploadRouter from './upload.js'

const router = Router()

// 示例路由
router.get('/', (req, res) => {
  res.json({ message: '明日旅途 API' })
})

// 用户路由
router.use('/users', usersRouter)

// 旅行路由
router.use('/travel', travelRouter)

// 日记路由
router.use('/diaries', diariesRouter)

// SecondMe OAuth 路由
router.use('/secondme', secondmeRouter)

// 记忆路由
router.use('/memories', memoriesRouter)

// 火花路由
router.use('/sparks', sparksRouter)

// 贴文路由
router.use('/posts', postsRouter)

// 邮件路由
router.use('/mails', mailsRouter)

// 聊天室路由
router.use('/chatrooms', chatroomsRouter)

// 上传路由
router.use('/upload', uploadRouter)

export default router
