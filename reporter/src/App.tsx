import { ThemeProvider } from "@/components/theme-provider";
import { Button } from "@/components/ui/button";

function App() {
  return (
    <ThemeProvider defaultTheme="dark" storageKey="reporter-ui-theme">
      <h1 className="scroll-m-20 text-4xl font-extrabold tracking-tight lg:text-5xl">
        Hello world!
      </h1>
      <div>
        <Button variant="default">tester</Button>
      </div>
    </ThemeProvider>
  );
}

export default App;
