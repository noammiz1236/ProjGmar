import { useContext } from "react";
import { AuthContext } from "../context/AuthContext";

export default function Profile() {
  const { user } = useContext(AuthContext);

  return (
    <div>
      <h1>Profile</h1>
      <p>{user?.first_name}</p>
      <p>{user?.email}</p>
    </div>
  );
}
