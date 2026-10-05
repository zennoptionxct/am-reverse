const express = require('express')
const path = require('path')
const apiRoutes = require('./app/api/route')

const app = express()
const PORT = process.env.PORT || 3300

app.use(require('cors')())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html') || filePath.endsWith('.css') || filePath.endsWith('.js')) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate')
    }
  }
}))

app.use('/api', apiRoutes)

app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, status: 'healthy' })
})

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'))
})

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 server jalan di http://localhost:${PORT}`)
  })
}

module.exports = app
