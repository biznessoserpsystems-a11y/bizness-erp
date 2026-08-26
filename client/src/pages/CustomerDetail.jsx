import FactSheet from '../components/FactSheet';
import { customerFactSheetConfig } from '../factsheets/customer';

export default function CustomerDetail() {
  return <FactSheet config={customerFactSheetConfig} />;
}
