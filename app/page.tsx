import ImageGeneratorForm from "./components/ImageGeneratorForm";

export default function Page() {
  return (
    <main style={{ padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1>Animal Image Generator</h1>
      <p>
        Upload an animal photo, choose a style, and generate an edited image.
      </p>
      <ImageGeneratorForm />
    </main>
  );
}
