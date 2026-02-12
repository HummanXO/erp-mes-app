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
}

function FallbackMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("shrink-0", className)}
      fill="none"
    >
      <path
        d="M12 3.5L22 21H2L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 8.8L16.4 16.5H7.6L12 8.8Z"
        fill="currentColor"
        opacity="0.18"
      />
    </svg>
  )
}

export function SidebarBrand({
  href = "/",
  onClick,
  className,
  iconSrc = "/dok-alliance-mark.png",
}: SidebarBrandProps) {
  const [imageFailed, setImageFailed] = React.useState(false)

  const content = (
    <>
      <div
        className={cn(
          "flex items-center justify-start",
          "group-data-[collapsible=icon]:justify-center"
        )}
      >
        <div className="relative h-6 w-6">
          {imageFailed ? (
            <FallbackMark className="h-6 w-6 text-sidebar-foreground" />
          ) : (
            <Image
              src={iconSrc}
              alt=""
              width={24}
              height={24}
              priority
              onError={() => setImageFailed(true)}
              className="h-6 w-6 object-contain"
            />
          )}
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

  if (!href) {
    return (
      <button type="button" className={sharedClassName} onClick={onClick}>
        {content}
      </button>
    )
  }

  return (
    <Link href={href} className={sharedClassName} onClick={onClick}>
      {content}
    </Link>
  )
}

