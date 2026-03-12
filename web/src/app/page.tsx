import {
  Header,
  Hero,
  TrustBar,
  Features,
  PricingComparison,
  Compliance,
  HowItWorks,
  Demo,
  CTAPricing,
  FAQ,
  FinalCTA,
  Footer,
} from "@/components/landing";

export default function HomePage() {
  return (
    <>
      <Header />
      <Hero />
      <TrustBar />
      <Features />
      <PricingComparison />
      <Compliance />
      <HowItWorks />
      {/* <Demo /> */}
      <CTAPricing />
      <FAQ />
      <FinalCTA />
      <Footer />
    </>
  );
}
