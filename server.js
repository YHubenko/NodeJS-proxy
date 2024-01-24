'use strict'

// Импорт модулей http и net
import * as http from 'node:http'
import * as net from 'node:net'

// Специальные символы для представления конца строки и порта сервера
const CRLF = '\r\n'
const PORT = 8000
const DEFAULT_HTTP_PORT = 80

// Функция для асинхронного получения тела запроса
const receiveBody = async (stream) => {
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)

  return Buffer.concat(chunks)
}

// Создание HTTP-сервера
const server = http.createServer(async (req, res) => {
  console.log('\nRequest received (HTTP)')
  const { remoteAddress, remotePort } = req.socket
  console.log(`Connection from ${remoteAddress}:${remotePort} to ${req.url}`)

  const { headers, url, method } = req
  const { pathname, hostname } = new URL(url)
  const options = { hostname, path: pathname, method, headers }

  // Создание HTTP-запроса и передача ответа клиенту
  const request = http.request(options, (result) => void result.pipe(res))

  // Если метод запроса не 'GET' или 'HEAD', получаем тело запроса и отправляем его в запрос
  if (method !== 'GET' && method !== 'HEAD') {
    const body = await receiveBody(req)
    request.write(body)
  }

  request.end()
})

// Обработка события 'connect' для HTTPS-запросов
server.on('connect', (req, socket, head) => {
  console.log('\nRequest received (HTTPS)')

  // Отправка успешного ответа для установки туннеля
  socket.write('HTTP/1.1 200 Connection Established' + CRLF + CRLF)

  const { remoteAddress, remotePort } = socket
  const { hostname, port } = new URL(`http://${req.url}`)
  const targetPort = parseInt(port, 10) || DEFAULT_HTTP_PORT

  // Создание TCP-соединения с целевым сервером и установка туннеля
  const proxy = net.connect(targetPort, hostname, () => {
    if (head) proxy.write(head)
    socket.pipe(proxy).pipe(socket)
  })

  console.log(
    `Connection from ${remoteAddress}:${remotePort} to ${hostname}:${targetPort}`
  )

  // Обработка ошибок и завершение соединения при возникновении ошибок
  proxy.on('error', (err) => {
    console.error(`Proxy connection error: ${err.message}\n`)
    socket.end()
  })

  socket.on('error', (err) => {
    console.error(`Socket error: ${err.message}\n`)
    proxy.end()
  })

  socket.on('end', () => {
    console.log(`Connection from ${remoteAddress}:${remotePort} closed\n`)
    proxy.end()
  })
})

// Запуск HTTP-прокси-сервера
console.log(`Starting HTTP proxy server on port ${PORT}...`)
server.listen(PORT, '0.0.0.0')
