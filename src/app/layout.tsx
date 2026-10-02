import type { Metadata } from "next";
import { Space_Grotesk, Montserrat } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";

const montserratHeading = Montserrat({subsets:['latin'],variable:'--font-heading'});

const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
});

const monsterrat = Montserrat({
  variable: "--font-monsterrat",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Hamid Mobiles and Communications ",
  description: "Hamid Mobiles and Communications | Hamid Mobiles",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", spaceGrotesk.variable, monsterrat.variable, montserratHeading.variable)}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
