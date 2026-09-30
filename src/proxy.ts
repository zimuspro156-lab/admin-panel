import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE } from '@/lib/constants'

const PUBLIC_PATHS = ['/login', '/setup']

/**
 * Быстрый отсев неавторизованных запросов по наличию куки.
 * Подпись и активность пользователя проверяются уже на странице (requireUser),
 * так что здесь достаточно дешёвой проверки без обращения к базе.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return NextResponse.next()
  }

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = new URL('/login', request.nextUrl)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
}
