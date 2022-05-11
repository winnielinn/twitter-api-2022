const { User, Reply, Tweet, Like, Followship } = require('../models')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { getUser } = require('../_helpers')

const userController = {
  register: async (req, res, next) => {
    try {
      if (req.body.password !== req.body.checkPassword) throw new Error('密碼與確認密碼不符。')

      if (await User.findOne({ where: { account: req.body.account } })) throw new Error('此帳號已經註冊。')

      await User.create({
        account: req.body.account,
        name: req.body.name,
        email: req.body.email,
        password: bcrypt.hashSync(req.body.password, 10)
      })
      res.json({ status: 'success', message: '註冊成功' })
    } catch (err) {
      next(err)
    }
  },
  login: async (req, res, next) => {
    try {
      const user = getUser(req)
      delete user.password
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' })
      res.json({ status: 'success', message: '登入成功', data: { token, user } })
    } catch (err) {
      next(err)
    }
  },
  getUser: async (req, res, next) => {
    try {
      const user = await User.findByPk(req.params.id, {
        include: [
          { model: User, as: 'Followers' },
          { model: User, as: 'Followings' }
        ]
      })
      res.json({ status: 'success', user })
    } catch (err) {
      next(err)
    }
  },
  getTweets: async (req, res, next) => {
    try {
      const userTweets = await Tweet.findAll({
        where: { userId: req.params.id },
        order: [['createdAt', 'DESC']]
      })
      res.json({ status: 'success', userTweets })
    } catch (err) {
      next(err)
    }
  },
  getRepliedTweets: async (req, res, next) => {
    try {
      const repliedTweets = await Reply.findAll({
        where: { userId: getUser(req).id },
        order: [['createdAt', 'DESC']]
      })
      res.json({ status: 'success', repliedTweets })
    } catch (err) {
      next(err)
    }
  },
  getLikes: async (req, res, next) => {
    try {
      const likes = await Like.findAll({
        where: { userId: getUser(req).id },
        order: [['createdAt', 'DESC']]
      })
      res.json({ status: 'success', likes })
    } catch (err) {
      next(err)
    }
  }
}
module.exports = userController
