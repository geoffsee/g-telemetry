import "./Layout.css";
import { usePageContext } from "vike-react/usePageContext";
import { Link } from "../components/Link";

export default function Layout({ children }: { children: React.ReactNode }) {
	const pageContext = usePageContext();
	const user = (pageContext as any).user;

	return (
		<div
			style={{
				display: "flex",
				maxWidth: 1000,
				margin: "auto",
			}}
		>
			<Sidebar>
				<div
					style={{
						marginTop: 20,
						marginBottom: 10,
						fontWeight: "bold",
						fontSize: "1.1em",
					}}
				>
					g-telemetry
				</div>
				<Link href="/">Verify</Link>
				{user && <Link href="/telemetry">Dashboard</Link>}
				<div style={{ marginTop: "auto", paddingTop: 20 }}>
					{user ? (
						<div style={{ display: "flex", alignItems: "center", gap: 10 }}>
							<img
								src={user.avatar}
								style={{ width: 32, height: 32, borderRadius: "50%" }}
							/>
							<div>
								<div style={{ fontSize: "0.8em" }}>{user.login}</div>
								<a href="/logout" style={{ fontSize: "0.8em" }}>
									Logout
								</a>
							</div>
						</div>
					) : (
						<a href="/login/github">Login with GitHub</a>
					)}
				</div>
			</Sidebar>
			<Content>{children}</Content>
		</div>
	);
}

function Sidebar({ children }: { children: React.ReactNode }) {
	return (
		<div
			id="sidebar"
			style={{
				padding: 20,
				flexShrink: 0,
				display: "flex",
				flexDirection: "column",
				lineHeight: "1.8em",
				borderRight: "2px solid #30363d",
			}}
		>
			{children}
		</div>
	);
}

function Content({ children }: { children: React.ReactNode }) {
	return (
		<div id="page-container">
			<div
				id="page-content"
				style={{
					padding: 20,
					paddingBottom: 50,
					minHeight: "100vh",
				}}
			>
				{children}
			</div>
		</div>
	);
}
