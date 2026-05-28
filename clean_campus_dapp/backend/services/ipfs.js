import axios from 'axios'
import FormData from 'form-data'
import dotenv from 'dotenv'

dotenv.config()

const PINATA_API_KEY = process.env.PINATA_API_KEY
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY

// 无外网依赖的占位图 data URL，避免 via.placeholder.com 导致 ERR_NAME_NOT_RESOLVED
const PLACEHOLDER_DATA_URL = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='300'%3E%3Crect fill='%23f0f0f0' width='400' height='300'/%3E%3Ctext fill='%23999' x='50%25' y='50%25' dominant-baseline='middle' text-anchor='middle' font-size='14'%3E%E5%9B%BE%E7%89%87%3C/text%3E%3C/svg%3E"

export async function uploadToIPFS(buffer, filename) {
  if (!PINATA_API_KEY || !PINATA_SECRET_KEY) {
    // 如果没有配置 Pinata，返回内联占位图，不发起外网请求
    console.warn('Pinata未配置，使用内联占位图')
    return PLACEHOLDER_DATA_URL
  }

  try {
    const formData = new FormData()
    formData.append('file', buffer, {
      filename: filename,
      contentType: 'image/jpeg'
    })

    const metadata = JSON.stringify({
      name: filename,
      keyvalues: {
        app: 'clean-campus'
      }
    })
    formData.append('pinataMetadata', metadata)

    const options = JSON.stringify({
      cidVersion: 0
    })
    formData.append('pinataOptions', options)
//console.log(formData)
    const response = await axios.post(
      'https://api.pinata.cloud/pinning/pinFileToIPFS',
      formData,
      {
        headers: {
          'pinata_api_key': PINATA_API_KEY,
          'pinata_secret_api_key': PINATA_SECRET_KEY,
          ...formData.getHeaders()
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    )

    return `${response.data.IpfsHash}`
  } catch (error) {
    console.error('IPFS上传失败:', error)
    return PLACEHOLDER_DATA_URL
  }
}

