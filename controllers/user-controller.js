const { User, Reply, Tweet, Like, Followship, sequelize } = require('../models')
const jwt = require('jsonwebtoken')
const bcrypt = require('bcryptjs')
const { isLikedTweet } = require('../helpers/tweet')
const imgurFileHandler = require('../helpers/file-helper')
const helpers = require('../_helpers')

const userController = {
  register: async (req, res, next) => {
    try {
      const { name, account, email, password, checkPassword } = req.body
      if (!name.trim() ||
        !account.trim() ||
        !email.trim() ||
        !password.trim() ||
        !checkPassword.trim()) throw new Error('所有欄位必填。')

      if (password !== checkPassword) throw new Error('密碼與確認密碼不符。')

      if (await User.findOne({ where: { account } })) throw new Error('帳號已經註冊。')
      if (await User.findOne({ where: { email } })) throw new Error('Email 已經註冊。')

      await User.create({
        account,
        name,
        email,
        password: bcrypt.hashSync(password, 10)
      })

      res.status(200).json({ message: '註冊成功' })
    } catch (err) {
      next(err)
    }
  },
  login: async (req, res, next) => {
    try {
      const user = helpers.getUser(req)
      const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '30d' })
      res.status(200).json({ token, user })
    } catch (err) {
      next(err)
    }
  },
  getUser: async (req, res, next) => {
    try {
      const user = await User.findByPk(req.params.id, {
        attributes: [
          'id', 'avatar', 'name', 'account', 'cover_image', 'introduction',
          [sequelize.literal('(SELECT COUNT(following_id) FROM Followships WHERE  following_id = User.id)'), 'followerCount'],
          [sequelize.literal('(SELECT COUNT(follower_id) FROM Followships WHERE  follower_id = User.id)'), 'folloingCount'],
          [sequelize.literal(`(SELECT COUNT(DISTINCT Tweets.id) FROM Tweets WHERE ${req.params.id} = User.id)`), 'tweetCount'],
        ],
        raw: true,
        nest: true
      })
      if (!user) throw new Error('無此使用者。')
      res.status(200).json(user)
    } catch (err) {
      next(err)
    }
  },
  getLoginUser: async (req, res, next) => {
    try {
      const loginUser = helpers.getUser(req)
      const user = await User.findByPk(loginUser.id, {
        attributes: [
          'id', 'avatar', 'name', 'account', 'cover_image', 'introduction',
          [sequelize.literal('(SELECT COUNT(following_id) FROM Followships WHERE  following_id = User.id)'), 'followerCount'],
          [sequelize.literal('(SELECT COUNT(follower_id) FROM Followships WHERE  follower_id = User.id)'), 'folloingCount'],
          [sequelize.literal(`(SELECT COUNT(DISTINCT Tweets.id) FROM Tweets WHERE User.id)`), 'tweetCount'],
        ],
        raw: true,
        nest: true
      })
      if (!user) throw new Error('無此使用者。')
      res.status(200).json({ message: '登入中使用者的資料', user })
    } catch (err) {
      next(err)
    }
  },
  getTweets: async (req, res, next) => {
    try {
      const userId = helpers.getUser(req).id
      const tweets = await Tweet.findAll({
        where: { UserId: req.params.id },
        attributes: [
          'id', 'description', 'createdAt',
          [sequelize.literal('(SELECT COUNT(tweet_id) FROM Replies WHERE tweet_id = Tweet.id)'), 'replyCount'],
          [sequelize.literal('(SELECT COUNT(tweet_id) FROM Likes WHERE tweet_id = Tweet.id)'), 'likeCount']
        ],
        include: [{
          model: User,
          attributes: [
            'id', 'avatar', 'name', 'account'
          ]
        }],
        order: [['createdAt', 'DESC'], ['id', 'DESC']]
      })
      if (!tweets.length) throw new Error('沒有任何推文。')

      const isLikedId = await isLikedTweet(userId)
      const result = tweets.map(tweet => ({
        ...tweet.toJSON(),
        isLiked: isLikedId.some(tId => tId === tweet.id)
      }))

      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  },
  getRepliedTweets: async (req, res, next) => {
    try {
      const replies = await Reply.findAll({
        where: { UserId: req.params.id },
        attributes: ['id', 'comment', 'createdAt'],
        include: [{
          model: User,
          attributes: ['name', 'account']
        }, {
          model: Tweet,
          attributes: [], include: [{
            model: User,
            attributes: ['id', 'avatar', 'account']
          }
          ]
        }],
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        raw: true,
        nest: true
      })
      if (!replies.length) throw new Error('沒有回覆過的推文。')
      res.status(200).json(replies)
    } catch (err) {
      next(err)
    }
  },
  getLikes: async (req, res, next) => {
    try {
      const userId = helpers.getUser(req)
      const likes = await Like.findAll({
        where: { UserId: req.params.id },
        attributes: [
          'TweetId', 'createdAt',
          [sequelize.literal('(SELECT COUNT(tweet_id) FROM Likes WHERE TweetId = tweet_id)'), 'likeCount'],
          [sequelize.literal('(SELECT COUNT(Replies.tweet_id) FROM Replies WHERE Replies.tweet_id = Like.tweet_id)'), 'replyCount'],
        ],
        include: [{
          model: Tweet, attributes: ['description'],
          include: [{
            model: User,
            attributes: ['id', 'avatar', 'name', 'account'],
            Where: { id: Tweet.userId }
          }]
        }],
        order: [['createdAt', 'DESC'], ['id', 'DESC']]
      })
      if (!likes.length) throw new Error('沒有喜歡的推文。')

      const isLikedId = await isLikedTweet(userId)
      const result = likes.map(like => ({
        ...like.toJSON(),
        isLiked: isLikedId.some(tId => tId === like.TweetId)
      }))
      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  },
  getFollowings: async (req, res, next) => {
    try {
      const user = helpers.getUser(req)

      const followings = await Followship.findAll({
        where: { followerId: req.params.id },
        attributes: [
          'followingId', 'createdAt',
          [sequelize.literal(`(SELECT avatar FROM Users WHERE id = following_id)`), 'avatar'],
          [sequelize.literal(`(SELECT name FROM Users WHERE id = following_id)`), 'name'],
          [sequelize.literal(`(SELECT introduction FROM Users WHERE id = following_id)`), 'introduction']
        ],
        order: [['createdAt', 'DESC'], ['id', 'DESC']]
      })
      if (!followings.length) throw new Error('沒有追隨者名單。')

      const result = followings.map(following => ({
        ...following.toJSON(),
        isFollowing: user.Followings.some(f => f.id === following.followingId)
      }))
      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  },
  getFollowers: async (req, res, next) => {
    try {
      const user = helpers.getUser(req)

      const followers = await Followship.findAll({
        where: { followingId: req.params.id },
        attributes: [
          'followerId', 'createdAt',
          [sequelize.literal(`(SELECT avatar FROM Users WHERE id = follower_id)`), 'avatar'],
          [sequelize.literal(`(SELECT name FROM Users WHERE id = follower_id)`), 'name'],
          [sequelize.literal(`(SELECT introduction FROM Users WHERE id = follower_id)`), 'introduction']
        ],
        order: [['createdAt', 'DESC'], ['id', 'DESC']]
      })
      if (!followers.length) throw new Error('沒有粉絲名單。')

      const result = followers.map(follower => ({
        ...follower.toJSON(),
        isFollowing: user.Followings.some(f => f.id === follower.followerId)
      }))
      res.status(200).json(result)
    } catch (err) {
      next(err)
    }
  },
  putUser: async (req, res, next) => {
    try {
      const queryId = Number(req.params.id)
      const logUser = helpers.getUser(req)
      if (queryId !== logUser.id) throw new Error('不可更改他人資料。')

      const { name, introduction } = req.body
      let avatar = req.files?.avatar || null
      let coverImage = req.files?.cover_image || null

      if (!name.trim() || !introduction.trim()) throw new Error('名字和自我介紹欄不可為空。')
      if (introduction.length > 160) throw new Error('自我介紹字數不可超過 160 字。')
      if (name.length > 50) throw new Error('名字字數不可超過 50 字。')

      if (avatar) avatar = await imgurFileHandler(avatar[0])
      if (coverImage) coverImage = await imgurFileHandler(coverImage[0])

      const user = await User.findByPk(logUser.id)
      const userUpdate = await user.update({
        name,
        introduction,
        avatar: avatar || logUser.avatar,
        cover_image: coverImage || logUser.cover_image
      })
      res.status(200).json({ message: '資料更改成功。', userUpdate })
    } catch (err) {
      next(err)
    }
  },
  getUserSetting: async (req, res, next) => {
    try {
      const userId = helpers.getUser(req).id
      const user = await User.findByPk(userId, {
        attributes: ['id', 'account', 'name', 'email']
      })
      if (!user) throw new Error('查無使用者')
      res.status(200).json({ message: '登入中的使用者資料', user })
    } catch (err) {
      next(err)
    }
  },
  putUserSetting: async (req, res, next) => {
    try {
      const { name, account, email, password, checkPassword } = req.body
      const user = helpers.getUser(req)

      if (!name.trim() ||
        !account.trim() ||
        !email.trim()) throw new Error('不可提交空白字元')

      if (password) {
        if (password.trim() !== checkPassword.trim()) throw new Error('密碼與確認密碼不符。')
      }

      if (user.account !== account || user.email !== email) {
        if (await User.findOne({ where: { account } })) throw new Error('此帳號已經存在。')
        if (await User.findOne({ where: { email } })) throw new Error('此email已經存在。')
      }

      const userUpdate = await user.update({
        name,
        account,
        email,
        password: password ? bcrypt.hashSync(password, 10) : user.password,
      })

      res.status(200).json({
        message: '成功修改個人資料',
        userUpdate: {
          name: userUpdate.name,
          account: userUpdate.account,
          email: userUpdate.email
        }
      })
    } catch (err) {
      next(err)
    }
  },
  getTopUsers: async (req, res, next) => {
    try {
      const userId = helpers.getUser(req).id
          
      const users = await User.findAll({
        attributes: [
          'id', 'account', 'name', 'avatar',
          [sequelize.literal('(SELECT COUNT(DISTINCT id) FROM Followships WHERE Followships.Following_id = User.id)'), 'followerCount'],
          [sequelize.literal(`EXISTS (SELECT Follower_id FROM Followships WHERE Followships.Following_id = User.id AND Followships.Follower_id  = ${userId})`), 'isFollowed']
        ],
        where: { role: 'user' },
        order: [[sequelize.col('followerCount'), 'DESC']],
        limit: 10,
        nest: true,
        raw: true
      })

      if (!users.length) throw new Error('無任何使用者')


      res.status(200).json({ message: '前十人氣王', users })
    } catch (err) {
      next(err)
    }
  },
  putUserPage: async (req, res, next) => {
    try {
      const userId = helpers.getUser(req).id
      const user = await User.findByPk(userId, {
        attributes: ['id', 'name', 'introduction', 'avatar', 'cover_image']
      })
      if (!user) throw new Error('查無使用者')
      res.status(200).json({ message: '登入中的使用者資料', user })
    } catch (err) {
      next(err)
    }
  }
}
module.exports = userController
