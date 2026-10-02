import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Shop Management System</CardTitle>
        </CardHeader>

        <CardContent>
          Project foundation is ready.
        </CardContent>
      </Card>
    </main>
  );
}