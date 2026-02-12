"use client"

import * as React from "react"
import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"

export type SidebarBrandProps = {
  href?: string
  onClick?: React.MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>
  className?: string
  iconSrc?: string
  logoSrc?: string
}

function FallbackMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 41"
      aria-hidden="true"
      className={cn("shrink-0", className)}
    >
      <path
        d="M7.839 40.783 23.869 12.729 20 6 0 40.783h7.839Z"
        fill="currentColor"
      />
      <path
        d="M16.053 40.783H40L27.99 19.894l-4.02 7.032 3.976 6.914H20.02l-3.967 6.943Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function SidebarBrand({
  href,
  onClick,
  className,
  iconSrc = "/dok-alliance-mark.png",
  logoSrc = "/dok-alliance-logo.png",
}: SidebarBrandProps) {
  const [markFailed, setMarkFailed] = React.useState(false)
  const [logoFailed, setLogoFailed] = React.useState(false)
  const shouldUseButton = href === undefined && typeof onClick === "function"
  const resolvedHref = href ?? "/"

  const content = (
    <>
      <div
        className={cn(
          "flex items-center justify-start",
          "group-data-[collapsible=icon]:justify-center"
        )}
      >
        <div className="hidden group-data-[collapsible=icon]:block">
          <div className="relative h-6 w-6">
            {markFailed ? (
              <FallbackMark className="h-6 w-6 text-sidebar-foreground" />
            ) : (
              <Image
                src={iconSrc}
                alt=""
                width={24}
                height={24}
                priority
                onError={() => setMarkFailed(true)}
                // The provided PNG is white; make it black on light theme and keep white in dark theme.
                className="h-6 w-6 object-contain brightness-0 dark:brightness-100"
              />
            )}
          </div>
        </div>

        <div className="block group-data-[collapsible=icon]:hidden">
          <div className="relative h-6">
            {logoFailed ? (
              <FallbackMark className="h-6 w-6 text-sidebar-foreground" />
            ) : (
              <Image
                src={logoSrc}
                alt=""
                width={420}
                height={115}
                priority
                onError={() => setLogoFailed(true)}
                // The provided PNG is white; make it black on light theme and keep white in dark theme.
                className="h-6 w-auto max-w-[11rem] object-contain brightness-0 dark:brightness-100"
              />
            )}
          </div>
        </div>
      </div>

      <div
        className={cn(
          "text-[11px] leading-tight text-sidebar-foreground/70",
          "group-hover:text-sidebar-accent-foreground/80",
          "group-data-[collapsible=icon]:hidden"
        )}
      >
        Система управления производством
      </div>
    </>
  )

  const sharedClassName = cn(
    "group w-full rounded-md px-3 py-2",
    "flex flex-col items-start gap-2 text-left",
    "outline-none transition-[background-color,box-shadow,color] duration-150",
    "hover:bg-sidebar-accent hover:shadow-[0_0_0_1px_hsl(var(--sidebar-border))]",
    "focus-visible:ring-2 focus-visible:ring-sidebar-ring",
    "group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2 group-data-[collapsible=icon]:py-2",
    className
  )

  if (shouldUseButton) {
    return (
      <button type="button" className={sharedClassName} onClick={onClick}>
        {content}
      </button>
    )
  }

  return (
    <Link href={resolvedHref} className={sharedClassName} onClick={onClick}>
      {content}
    </Link>
  )
}
