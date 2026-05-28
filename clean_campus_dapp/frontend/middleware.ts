import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Chrome DevTools 会请求此路径。路径含点号，matcher 用通配符再在内部精确判断
const CHROME_DEVTOOLS_PATH = '/.well-known/appspecific/com.chrome.devtools.json'

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === CHROME_DEVTOOLS_PATH) {
    return new NextResponse(null, { status: 204 })
  }
  return NextResponse.next()
}

export const config = {
  // 只对 .well-known 下路径执行，避免点号在 path-to-regexp 里被当通配符导致不匹配
  matcher: ['/.well-known/:path*'],
}
